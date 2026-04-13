/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * Includes Urdu/Arabic fonts and confidence color mappings.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
    /** Urdu Modern (Noto Naskh Arabic) */
    urduModern: 'system-ui',
    /** Urdu Traditional (Alvi Nastaliq) */
    urduTraditional: 'system-ui',
    /** Arabic fonts */
    arabic: 'system-ui',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
    urduModern: 'normal',
    urduTraditional: 'normal',
    arabic: 'normal',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
    /** Urdu Modern (Google Fonts Noto Naskh Arabic) */
    urduModern: "'Noto Naskh Arabic', 'Noto Sans Arabic', system-ui, sans-serif",
    /** Urdu Traditional (Alvi Nastaliq for classic/poetic style) */
    urduTraditional: "'Alvi Nastaliq', 'Noto Naskh Arabic', system-ui, sans-serif",
    /** Arabic (Modern Standard + Gulf) */
    arabic: "'Noto Naskh Arabic', 'Noto Sans Arabic', system-ui, sans-serif",
  },
});

/** Confidence color mapping for visual feedback */
export const ConfidenceColors = {
  HIGH: '#10B981',        // Green ✅
  MEDIUM: '#F59E0B',      // Amber ⚠️
  LOW: '#FF6B35',         // Orange
  VERY_LOW: '#EF4444',    // Red ❌
};

/** Get confidence color based on score (0-100) */
export function getConfidenceColor(confidence: number): string {
  if (confidence >= 85) return ConfidenceColors.HIGH;
  if (confidence >= 70) return ConfidenceColors.MEDIUM;
  if (confidence >= 50) return ConfidenceColors.LOW;
  return ConfidenceColors.VERY_LOW;
}

/** Get confidence level label */
export function getConfidenceLevel(confidence: number): 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW' {
  if (confidence >= 85) return 'HIGH';
  if (confidence >= 70) return 'MEDIUM';
  if (confidence >= 50) return 'LOW';
  return 'VERY_LOW';
}

/** Select font family based on language */
export function getFontFamily(locale: string, preferTraditional: boolean = false): string {
  const isUrdu = locale.includes('ur');
  const isArabic = locale.includes('ar');

  if (Platform.OS === 'web') {
    if (isUrdu) {
      return preferTraditional ? Fonts.web.urduTraditional : Fonts.web.urduModern;
    }
    if (isArabic) {
      return Fonts.web.arabic;
    }
    return Fonts.web.sans;
  }

  return Fonts.default.sans;
}
