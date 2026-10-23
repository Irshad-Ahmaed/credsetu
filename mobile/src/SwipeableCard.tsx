import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from './theme';
import { shouldDeleteSwipe, shouldStartSwipe } from './swipeLogic';

export function SwipeableCard({ children, onDelete, disabled, reduceMotion }: {
  children: ReactNode; onDelete: () => void; disabled: boolean; reduceMotion: boolean;
}) {
  const offset = useRef(new Animated.Value(0)).current;
  const width = useRef(300);
  const mounted = useRef(true);
  const cancelled = useRef(false);
  const current = useRef({ onDelete, disabled, reduceMotion });
  useLayoutEffect(() => { current.current = { onDelete, disabled, reduceMotion }; }, [onDelete, disabled, reduceMotion]);
  const reset = useCallback(() => {
    if (!mounted.current) return;
    if (current.current.reduceMotion) offset.setValue(0);
    else Animated.spring(offset, { toValue: 0, useNativeDriver: true, speed: 25, bounciness: 0 }).start();
  }, [offset]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; offset.stopAnimation(); };
  }, [offset]);
  useEffect(() => { if (disabled) { cancelled.current = true; offset.stopAnimation(); offset.setValue(0); } }, [disabled, offset]);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) => {
      const screenWidth = Dimensions.get('window').width;
      // Leave the screen edges available for the operating system's back gestures.
      return gesture.x0 > 24 && gesture.x0 < screenWidth - 24
        && shouldStartSwipe(gesture.dx, gesture.dy, gesture.numberActiveTouches, current.current.disabled);
    },
    onPanResponderGrant: () => { cancelled.current = false; offset.stopAnimation(); },
    onPanResponderMove: (_event, gesture) => {
      if (current.current.disabled || gesture.numberActiveTouches !== 1) { cancelled.current = true; offset.setValue(0); return; }
      const limit = Math.min(120, width.current * 0.5);
      offset.setValue(Math.max(-limit, Math.min(limit, gesture.dx)));
    },
    onPanResponderRelease: (_event, gesture) => {
      const commit = mounted.current && !cancelled.current && !current.current.disabled
        && shouldDeleteSwipe(gesture.dx, gesture.dy, gesture.vx, width.current);
      reset();
      if (commit) current.current.onDelete();
    },
    onPanResponderTerminationRequest: () => true,
    onPanResponderTerminate: () => { cancelled.current = true; reset(); },
  }), [offset, reset]);

  return <View onLayout={(event) => { width.current = event.nativeEvent.layout.width; }} style={styles.frame}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.underlay}>
      {['left', 'right'].map((side) => <View key={side} style={styles.action}>
        <Text style={styles.symbol}>×</Text><Text style={styles.label}>Delete</Text>
      </View>)}
    </View>
    <Animated.View {...responder.panHandlers} style={{ transform: [{ translateX: offset }] }}>{children}</Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  frame: { marginBottom: 14, borderRadius: radius.card, overflow: 'hidden' },
  underlay: { ...StyleSheet.absoluteFill, backgroundColor: colors.danger, flexDirection: 'row', justifyContent: 'space-between' },
  action: { width: 84, justifyContent: 'center', alignItems: 'center', gap: 2 },
  symbol: { color: '#FFFFFF', fontSize: 30, lineHeight: 34 },
  label: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
});
