# patches the freshly generated Capacitor android project so the terminal code compiles into it
import re,sys,os
A="android"
def rw(p,fn):
    s=open(p).read();n=fn(s);open(p,"w").write(n)
# 1) jitpack (terminal-view lives there)
def jit(s):
    if "jitpack.io" in s: return s
    return re.sub(r"(allprojects\s*\{\s*repositories\s*\{)",r"\1\n        maven { url 'https://jitpack.io' }",s,1)
rw(A+"/build.gradle",jit)
if os.path.exists(A+"/settings.gradle"):
    def jit2(s):
        if "jitpack.io" in s or "dependencyResolutionManagement" not in s: return s
        return re.sub(r"(dependencyResolutionManagement\s*\{[^}]*?repositories\s*\{)",r"\1\n        maven { url 'https://jitpack.io' }",s,1,flags=re.S)
    rw(A+"/settings.gradle",jit2)
# 2) app module: dependencies, rootfs not compressed, proot executable from nativeLibraryDir
def app(s):
    s=s.replace("dependencies {","dependencies {\n    implementation 'com.github.termux.termux-app:terminal-view:v0.118.0'\n    implementation 'org.apache.commons:commons-compress:1.26.2'",1)
    s=re.sub(r"(android\s*\{)",r"\1\n    androidResources { noCompress 'dat' }\n    packagingOptions { jniLibs { useLegacyPackaging true } }",s,1)
    return s
rw(A+"/app/build.gradle",app)
# 3) minSdk 24 (terminal library needs it)
rw(A+"/variables.gradle",lambda s:re.sub(r"minSdkVersion\s*=\s*\d+","minSdkVersion = 24",s))
# 4) manifest: permissions, activity, service
def man(s):
    perms="".join('    <uses-permission android:name="android.permission.%s" />\n'%p for p in ["FOREGROUND_SERVICE","FOREGROUND_SERVICE_SPECIAL_USE","POST_NOTIFICATIONS","REQUEST_IGNORE_BATTERY_OPTIMIZATIONS","WAKE_LOCK"] if p not in s)
    s=s.replace("<application",perms+"    <application",1)
    comp='''        <activity android:name="com.myterminal.app.TerminalActivity" android:exported="false" android:theme="@android:style/Theme.DeviceDefault.NoActionBar" android:launchMode="singleTop" android:windowSoftInputMode="adjustResize|stateAlwaysVisible" android:configChanges="orientation|screenSize|keyboardHidden|keyboard" />
        <service android:name="com.myterminal.app.TerminalService" android:exported="false" android:foregroundServiceType="specialUse">
            <property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="interactive terminal session" />
        </service>
'''
    return s.replace("</application>",comp+"    </application>",1)
rw(A+"/app/src/main/AndroidManifest.xml",man)
print("terminal inject ok")
