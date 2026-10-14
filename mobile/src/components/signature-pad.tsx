import { useRef, useState } from 'react';
import { type GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Colors, Fonts, FontSize, Radius, Spacing } from '@/constants/theme';
import { t } from '@/i18n';

import { Button } from './ui';

// Le tracé est enregistré dans un repère fixe, quelle que soit la taille de l'écran.
export const SIGNATURE_VIEWBOX = { width: 320, height: 160 };

type Point = [number, number];

function toPath(strokes: Point[][]): string {
  return strokes
    .filter((stroke) => stroke.length > 0)
    .map((stroke) => stroke.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' '))
    .join(' ');
}

/** Affiche une signature enregistrée (tracé SVG). */
export function SignatureView({ path, height = 80 }: { path: string; height?: number }) {
  return (
    <View style={[styles.view, { height }]}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${SIGNATURE_VIEWBOX.width} ${SIGNATURE_VIEWBOX.height}`}>
        <Path d={path} fill="none" stroke={Colors.text} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

/**
 * Zone de signature au doigt. `onChange` reçoit le tracé (commandes M/L) à chaque trait terminé,
 * '' après effacement. `onSigning` permet de bloquer le défilement de la page pendant la signature.
 */
export function SignaturePad({ onChange, onSigning }: { onChange: (path: string) => void; onSigning?: (active: boolean) => void }) {
  const strokes = useRef<Point[][]>([]);
  const size = useRef({ width: 1, height: 1 });
  const [path, setPath] = useState('');

  const point = (x: number, y: number): Point => [
    Math.round((x / size.current.width) * SIGNATURE_VIEWBOX.width * 10) / 10,
    Math.round((y / size.current.height) * SIGNATURE_VIEWBOX.height * 10) / 10,
  ];

  // Gestes gérés directement par la zone de signature (système de « responder » de React Native).
  const startStroke = (event: GestureResponderEvent) => {
    onSigning?.(true);
    strokes.current = [...strokes.current, [point(event.nativeEvent.locationX, event.nativeEvent.locationY)]];
    setPath(toPath(strokes.current));
  };
  const extendStroke = (event: GestureResponderEvent) => {
    const current = strokes.current[strokes.current.length - 1];
    if (!current) return;
    current.push(point(event.nativeEvent.locationX, event.nativeEvent.locationY));
    setPath(toPath(strokes.current));
  };
  const endStroke = () => {
    onSigning?.(false);
    onChange(toPath(strokes.current));
  };

  const clear = () => {
    strokes.current = [];
    setPath('');
    onChange('');
  };

  return (
    <View style={{ gap: Spacing.xs }}>
      <View
        style={styles.pad}
        onLayout={(event) => {
          size.current = { width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height };
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={startStroke}
        onResponderMove={extendStroke}
        onResponderRelease={endStroke}
        onResponderTerminate={endStroke}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${SIGNATURE_VIEWBOX.width} ${SIGNATURE_VIEWBOX.height}`}>
          <Path d={path} fill="none" stroke={Colors.text} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        {!path ? <Text style={styles.placeholder} pointerEvents="none">{t('Signez ici')}</Text> : null}
      </View>
      <Button title={t('Effacer la signature')} variant="ghost" onPress={clear} disabled={!path} />
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    height: 180,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
  },
  placeholder: { fontFamily: Fonts.regular,
    position: 'absolute',
    alignSelf: 'center',
    top: 76,
    fontSize: FontSize.body,
    color: Colors.textMuted,
  },
  view: { borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm, backgroundColor: Colors.surface },
});
