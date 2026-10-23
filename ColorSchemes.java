package com.myterminal.app;

/** Color schemes. Index 0 is the classic palette by default. */
public class ColorSchemes {

    public static class Scheme {
        public final String name;
        public final int fg, bg, cursor;
        public final int[] palette; // 16 colors

        Scheme(String name, int fg, int bg, int cursor, int... palette) {
            this.name = name;
            this.fg = 0xFF000000 | fg;
            this.bg = 0xFF000000 | bg;
            this.cursor = 0xFF000000 | cursor;
            this.palette = new int[16];
            for (int i = 0; i < 16; i++) this.palette[i] = 0xFF000000 | palette[i];
        }
    }

    public static final Scheme[] ALL = new Scheme[]{
            new Scheme("Classic", 0xFFFFFF, 0x000000, 0xFFFFFF,
                    0x000000, 0xCD0000, 0x00CD00, 0xCDCD00, 0x6495ED, 0xCD00CD, 0x00CDCD, 0xE5E5E5,
                    0x7F7F7F, 0xFF0000, 0x00FF00, 0xFFFF00, 0x5C5CFF, 0xFF00FF, 0x00FFFF, 0xFFFFFF),

            new Scheme("Dracula", 0xF8F8F2, 0x282A36, 0xF8F8F2,
                    0x21222C, 0xFF5555, 0x50FA7B, 0xF1FA8C, 0xBD93F9, 0xFF79C6, 0x8BE9FD, 0xF8F8F2,
                    0x6272A4, 0xFF6E6E, 0x69FF94, 0xFFFFA5, 0xD6ACFF, 0xFF92DF, 0xA4FFFF, 0xFFFFFF),

            new Scheme("Solarized Dark", 0x839496, 0x002B36, 0x93A1A1,
                    0x073642, 0xDC322F, 0x859900, 0xB58900, 0x268BD2, 0xD33682, 0x2AA198, 0xEEE8D5,
                    0x002B36, 0xCB4B16, 0x586E75, 0x657B83, 0x839496, 0x6C71C4, 0x93A1A1, 0xFDF6E3),

            new Scheme("Gruvbox Dark", 0xEBDBB2, 0x282828, 0xEBDBB2,
                    0x282828, 0xCC241D, 0x98971A, 0xD79921, 0x458588, 0xB16286, 0x689D6A, 0xA89984,
                    0x928374, 0xFB4934, 0xB8BB26, 0xFABD2F, 0x83A598, 0xD3869B, 0x8EC07C, 0xEBDBB2),
    };

    public static String[] names() {
        String[] n = new String[ALL.length];
        for (int i = 0; i < n.length; i++) n[i] = ALL[i].name;
        return n;
    }
}
