import AuthPageShell from "@/components/auth-page-shell";
import { UpdatePasswordForm } from "@/components/update-password-form";

export default function Page() {
  return (
    <AuthPageShell>
      <div className="w-full">
        <UpdatePasswordForm />
      </div>
    </AuthPageShell>
  );
}
