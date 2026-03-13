import AuthPageShell from "@/components/auth-page-shell";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export default function Page() {
  return (
    <AuthPageShell>
      <div className="w-full">
        <ForgotPasswordForm />
      </div>
    </AuthPageShell>
  );
}
