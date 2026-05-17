import { AuthVisualPanel } from "./auth-visual-panel";
import { AuthFormPanel } from "./auth-form-panel";

export function AuthScreen() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,600px)_1fr]">
      <AuthVisualPanel />
      <AuthFormPanel />
    </div>
  );
}
