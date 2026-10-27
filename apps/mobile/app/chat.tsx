import { Redirect } from 'expo-router';

/** Legacy `/chat` → chat-as-home at `/`. */
export default function ChatRedirect() {
  return <Redirect href="/" />;
}
