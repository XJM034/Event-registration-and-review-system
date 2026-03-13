import AuthPageShell from "@/components/auth-page-shell";
import { SignUpForm } from "@/components/sign-up-form";

export default function Page() {
  return (
    <AuthPageShell>
      <div className="w-full">
        <SignUpForm />
      </div>
    </AuthPageShell>
  );
}
