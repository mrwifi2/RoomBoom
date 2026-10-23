package com.myterminal.app;

import android.content.Context;
import android.system.Os;
import android.system.OsConstants;

import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream;
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/** Extracts a rootfs (from assets) on first use and builds the proot command line. */
public class RootfsInstaller {

    public interface Progress { void update(String msg); }

    static File rootfsDir(Context c, Distro d) { return new File(c.getFilesDir(), "rootfs-" + d.id); }
    static File tmpDir(Context c) { return new File(c.getFilesDir(), "tmp"); }
    static File marker(Context c, Distro d) { return new File(c.getFilesDir(), d.id + ".installed"); }

    public static boolean isInstalled(Context c, Distro d) { return marker(c, d).exists(); }

    /** Deletes the extracted Linux so the next launch extracts a fresh copy from the app's assets. */
    public static void reset(Context c, Distro d) {
        marker(c, d).delete();
        deleteRecursive(rootfsDir(c, d));
    }

    public static void ensureInstalled(Context c, Distro d, Progress p) throws Exception {
        if (isInstalled(c, d)) return;

        File root = rootfsDir(c, d);
        deleteRecursive(root);            // clean up any half-finished earlier attempt
        root.mkdirs();
        tmpDir(c).mkdirs();

        p.update("First launch of " + d.id + ": extracting...\n(this takes a minute)");

        InputStream assetStream;
        try {
            assetStream = c.getAssets().open(d.asset);
        } catch (FileNotFoundException e) {
            String[] present = c.getAssets().list("");
            throw new Exception(d.id + " not found in app assets (" + d.asset + ").\nAssets present: "
                    + java.util.Arrays.toString(present)
                    + "\nlibproot: " + new File(c.getApplicationInfo().nativeLibraryDir, "libproot.so").exists());
        }

        BufferedInputStream in = new BufferedInputStream(assetStream, 1 << 16);
        in.mark(2);
        int b1 = in.read(), b2 = in.read();
        in.reset();
        boolean isGzip = (b1 == 0x1f && b2 == 0x8b);        // tolerate an already-unpacked .tar too
        InputStream payload = isGzip ? new GzipCompressorInputStream(in) : in;

        try (InputStream closeMe = payload;
             TarArchiveInputStream tar = new TarArchiveInputStream(payload)) {

            TarArchiveEntry e;
            int n = 0;
            while ((e = tar.getNextTarEntry()) != null) {
                String name = e.getName();
                while (name.startsWith("./")) name = name.substring(2);
                if (name.isEmpty() || name.equals(".")) continue;
                if (name.contains("..")) continue;                       // safety
                if (e.isCharacterDevice() || e.isBlockDevice() || e.isFIFO()) continue;

                File out = new File(root, name);
                int mode = e.getMode() & 0777;

                if (e.isDirectory()) {
                    out.mkdirs();
                    Os.chmod(out.getAbsolutePath(), mode | 0700);
                } else if (e.isSymbolicLink()) {
                    out.getParentFile().mkdirs();
                    if (isLink(out) || out.exists()) out.delete();
                    Os.symlink(e.getLinkName(), out.getAbsolutePath());
                } else if (e.isLink()) {
                    String target = e.getLinkName();
                    while (target.startsWith("./")) target = target.substring(2);
                    out.getParentFile().mkdirs();
                    copyFile(new File(root, target), out);
                } else {
                    out.getParentFile().mkdirs();
                    if (isLink(out) || out.exists()) out.delete();
                    try (OutputStream os = new FileOutputStream(out)) {
                        byte[] buf = new byte[1 << 15];
                        int r;
                        while ((r = tar.read(buf)) > 0) os.write(buf, 0, r);
                    }
                    Os.chmod(out.getAbsolutePath(), mode | 0600);
                }
                if (++n % 300 == 0) p.update("Extracting " + d.id + "... " + n + " files");
            }
        }

        postSetup(root, d);
        new FileOutputStream(marker(c, d)).close();
    }

    private static void postSetup(File root, Distro d) throws Exception {
        // mount points for proot binds
        for (String dir : new String[]{"dev", "proc", "sys", "sdcard", "tmp", "root", "etc"}) {
            File f = new File(root, dir);
            f.mkdirs();
        }
        Os.chmod(new File(root, "tmp").getAbsolutePath(), 01777);
        Os.chmod(new File(root, "root").getAbsolutePath(), 0700);

        write(new File(root, "etc/resolv.conf"), "nameserver 8.8.8.8\nnameserver 1.1.1.1\n");
        write(new File(root, "etc/hosts"), "127.0.0.1 localhost\n::1 localhost\n");

        if (d.usesApt()) {
            // apt's sandbox user does not work under proot
            File apt = new File(root, "etc/apt/apt.conf.d");
            apt.mkdirs();
            write(new File(apt, "01-proot"), "APT::Sandbox::User \"root\";\n");
        }
    }

    private static final String PS1_LINE =
            "PS1='\\[\\e[1;32m\\]\\u@terminal\\[\\e[0m\\]:\\[\\e[1;34m\\]\\w\\[\\e[0m\\]\\$ '\n";

    /** Runs on every launch (safe to repeat): custom prompt so the hostname 'localhost' is not shown. */
    public static void applyConfig(Context c, Distro d) throws Exception {
        File root = rootfsDir(c, d);
        // login shell (sh -l / bash -l)
        appendOnce(new File(root, "root/.profile"), "# myterminal-prompt",
                "\n# myterminal-prompt\n"
                        + "if [ -n \"$BASH_VERSION\" ] && [ -f \"$HOME/.bashrc\" ]; then . \"$HOME/.bashrc\"; fi\n"
                        + PS1_LINE + "export PS1\n");
        // nested bash shells
        if (d.usesApt()) {
            appendOnce(new File(root, "root/.bashrc"), "# myterminal-prompt",
                    "\n# myterminal-prompt\n" + PS1_LINE);
        }
    }

    private static void appendOnce(File f, String marker, String block) throws Exception {
        f.getParentFile().mkdirs();
        String existing = "";
        if (f.exists()) {
            try (InputStream in = new FileInputStream(f)) {
                java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int r;
                while ((r = in.read(buf)) > 0) bo.write(buf, 0, r);
                existing = bo.toString();
            }
        }
        if (existing.contains(marker)) return;
        try (OutputStream os = new FileOutputStream(f, true)) { os.write(block.getBytes()); }
    }

    private static void write(File f, String text) throws Exception {
        f.getParentFile().mkdirs();
        if (isLink(f)) f.delete();
        try (OutputStream os = new FileOutputStream(f)) { os.write(text.getBytes()); }
    }

    private static boolean isLink(File f) {
        try { return OsConstants.S_ISLNK(Os.lstat(f.getAbsolutePath()).st_mode); }
        catch (Exception e) { return false; }
    }

    private static void copyFile(File a, File b) throws Exception {
        try (InputStream in = new FileInputStream(a); OutputStream out = new FileOutputStream(b)) {
            byte[] buf = new byte[1 << 15];
            int r;
            while ((r = in.read(buf)) > 0) out.write(buf, 0, r);
        }
        Os.chmod(b.getAbsolutePath(), 0755);
    }

    private static void deleteRecursive(File f) {
        if (!f.exists() && !isLink(f)) return;
        if (!isLink(f) && f.isDirectory()) {
            try { Os.chmod(f.getAbsolutePath(), 0700); } catch (Exception ignored) { }
            File[] kids = f.listFiles();
            if (kids != null) for (File k : kids) deleteRecursive(k);
        }
        f.delete();
    }

    /** proot ships as libproot.so so Android lets us execute it from nativeLibraryDir. */
    public static String[] shellCommand(Context c, Distro d) {
        String lib = c.getApplicationInfo().nativeLibraryDir;
        return new String[]{
                lib + "/libproot.so",
                "--kill-on-exit",
                "--link2symlink",
                "-0",
                "-r", rootfsDir(c, d).getAbsolutePath(),
                "-b", "/dev",
                "-b", "/proc",
                "-b", "/sys",
                "-b", "/sdcard:/sdcard",
                "-w", "/root",
                d.shell, "-l"
        };
    }

    public static String[] environment(Context c) {
        String lib = c.getApplicationInfo().nativeLibraryDir;
        return new String[]{
                "HOME=/root",
                "TERM=xterm-256color",
                "COLORTERM=truecolor",
                "LANG=C.UTF-8",
                "TMPDIR=/tmp",
                "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
                "PROOT_TMP_DIR=" + tmpDir(c).getAbsolutePath(),
                "PROOT_LOADER=" + lib + "/libproot-loader.so"
        };
    }
}
