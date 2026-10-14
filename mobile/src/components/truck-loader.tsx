import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, I18nManager, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, FontSize, Spacing } from '@/constants/theme';
import { t } from '@/i18n';

const SIZES = {
  large: { width: 200, truck: 56, road: 10, dash: 22, gap: 14 },
  small: { width: 110, truck: 30, road: 6, dash: 12, gap: 8 },
};

/**
 * Indicateur de chargement : un poids lourd qui roule.
 * Les marquages de la route défilent sous le camion, qui tressaute légèrement.
 * En arabe (lecture de droite à gauche), la scène est inversée : le camion roule vers la gauche.
 */
export function TruckLoader({ size = 'large', label }: { size?: keyof typeof SIZES; label?: string | false }) {
  const s = SIZES[size];
  const period = s.dash + s.gap;
  const [road] = useState(() => new Animated.Value(0));
  const [bump] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const drive = Animated.loop(
      Animated.timing(road, { toValue: 1, duration: 450, easing: Easing.linear, useNativeDriver: true }),
    );
    const shake = Animated.loop(
      Animated.sequence([
        Animated.timing(bump, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(bump, { toValue: 0, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.delay(120),
      ]),
    );
    drive.start();
    shake.start();
    return () => {
      drive.stop();
      shake.stop();
    };
  }, [reduceMotion, road, bump]);

  const dashes = Math.ceil(s.width / period) + 1;
  const roadShift = road.interpolate({ inputRange: [0, 1], outputRange: [0, -period] });
  const truckLift = bump.interpolate({ inputRange: [0, 1], outputRange: [0, -s.truck * 0.05] });
  const caption = label === false ? null : (label ?? t('Un instant…'));

  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel={caption ?? t('Un instant…')}>
      <View style={[{ width: s.width }, I18nManager.isRTL && styles.mirror]}>
        <Animated.View style={[styles.truck, { transform: [{ translateY: truckLift }] }]}>
          <MaterialCommunityIcons name="truck-fast" size={s.truck} color={Colors.accent} />
        </Animated.View>
        <View style={[styles.road, { height: s.road, borderRadius: s.road / 2 }]}>
          <Animated.View style={[styles.lane, { transform: [{ translateX: roadShift }] }]}>
            {Array.from({ length: dashes }, (_, i) => (
              <View
                key={i}
                style={{ width: s.dash, marginRight: s.gap, height: Math.max(2, s.road / 4), backgroundColor: Colors.white }}
              />
            ))}
          </Animated.View>
        </View>
      </View>
      {caption ? <Text style={[styles.caption, size === 'small' && { fontFamily: Fonts.regular, fontSize: FontSize.caption }]}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  mirror: { transform: [{ scaleX: -1 }] },
  truck: { alignSelf: 'center', marginBottom: -2 },
  road: { backgroundColor: Colors.text, overflow: 'hidden', justifyContent: 'center' },
  lane: { flexDirection: 'row', alignItems: 'center' },
  caption: { fontFamily: Fonts.regular, fontSize: FontSize.small, color: Colors.textSecondary },
});
