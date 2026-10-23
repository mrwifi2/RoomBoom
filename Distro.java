package com.myterminal.app;

public enum Distro {
    ALPINE("alpine", "Alpine Linux  (small, apk)", "rootfs-alpine.dat", "/bin/sh"),
    DEBIAN("debian", "Debian  (apt, glibc)", "rootfs-debian.dat", "/bin/bash"),
    UBUNTU("ubuntu", "Ubuntu  (apt, glibc)", "rootfs-ubuntu.dat", "/bin/bash");

    public final String id;
    public final String title;
    public final String asset;
    public final String shell;

    Distro(String id, String title, String asset, String shell) {
        this.id = id;
        this.title = title;
        this.asset = asset;
        this.shell = shell;
    }

    /** only the distros whose root filesystem is really bundled in this build */
    public static java.util.List<Distro> available(android.content.Context c) {
        java.util.List<Distro> out = new java.util.ArrayList<>();
        try {
            java.util.List<String> have = java.util.Arrays.asList(c.getAssets().list(""));
            for (Distro d : values()) if (have.contains(d.asset)) out.add(d);
        } catch (Exception e) { }
        if (out.isEmpty()) out.add(ALPINE);
        return out;
    }

    public boolean usesApt() { return this != ALPINE; }

    public static Distro fromId(String id) {
        for (Distro d : values()) if (d.id.equals(id)) return d;
        return ALPINE;
    }
}
