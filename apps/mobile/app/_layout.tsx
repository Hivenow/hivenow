import { Stack } from 'expo-router';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';

// No fallback: a build without EXPO_PUBLIC_CONVEX_URL must fail loudly rather than
// silently talk to whichever deployment happened to be hard-coded here.
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error(
    'EXPO_PUBLIC_CONVEX_URL is not set. Configure it in apps/mobile/.env.local for local ' +
      'development, or in the EAS build profile environment for builds.'
  );
}
const convex = new ConvexReactClient(convexUrl);

export default function RootLayout() {
  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <ConvexProvider client={convex}>
        <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: '#ffffff' },
            }}
          />
        </View>
      </ConvexProvider>
    </SafeAreaProvider>
  );
}
