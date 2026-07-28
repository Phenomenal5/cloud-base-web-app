"use client";

import { useEffect, useRef, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import * as yup from "yup";
import { Camera, Loader2, Trash2 } from "lucide-react";
import {
  useUpdateProfileMutation,
  useUploadAvatarMutation,
  useDeleteAvatarMutation,
} from "@/store/api";
import { useAppSelector } from "@/store/hooks";
import { useYupForm } from "@/hooks/useYupForm";
import { getApiErrorMessage } from "@/lib/apiError";
import type { User } from "@/lib/types";
import { AppHeader } from "@/components/layout/AppHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const profileSchema = yup.object({
  displayName: yup
    .string()
    .trim()
    .min(1, "Name is required")
    .max(80, "Name is too long")
    .required("Name is required"),
});

// Split out so the form only mounts once the user is loaded and can initialize
// with real values rather than empty ones.
const ProfileForm = ({ user }: { user: User }) => {
  const [updateProfile] = useUpdateProfileMutation();
  const [uploadAvatar, { isLoading: isUploading }] = useUploadAvatarMutation();
  const [deleteAvatar, { isLoading: isRemoving }] = useDeleteAvatarMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useYupForm({
    schema: profileSchema,
    initialValues: { displayName: user.displayName },
    onSubmit: async (values) => {
      try {
        await updateProfile(values).unwrap();
        toast.success("Profile updated");
      } catch (error) {
        toast.error(getApiErrorMessage(error));
      }
    },
  });

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("avatar", file);

    try {
      await uploadAvatar(formData).unwrap();
      toast.success("Photo updated");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      // Reset the input, or picking the same file again fires no change event.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    try {
      await deleteAvatar().unwrap();
      toast.success("Photo removed");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Profile</h1>

      <section className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4">
        <Avatar name={user.displayName} src={user.avatarUrl} size={64} />
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-surface-2 disabled:opacity-60"
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              Change photo
            </button>
            {user.avatarUrl && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                disabled={isRemoving}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted transition hover:text-rose-500 disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" /> Remove
              </button>
            )}
          </div>
          <p className="text-xs text-muted">JPG or PNG, up to 2&nbsp;MB.</p>
        </div>
        {/* The real input is hidden; the styled button above triggers it. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={handleAvatarChange}
        />
      </section>

      <form onSubmit={form.handleSubmit} className="flex flex-col gap-4" noValidate>
        <Input
          label="Name"
          name="displayName"
          value={form.values.displayName}
          onChange={form.handleChange}
          error={form.errors.displayName}
        />
        <div className="flex flex-col gap-1.5">
          {/* Read-only: changing the email would mean re-verifying it. */}
          <label className="text-sm font-medium">Email</label>
          <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-muted">
            {user.email}
          </p>
        </div>
        <Button type="submit" loading={form.isSubmitting} className="self-start">
          Save changes
        </Button>
      </form>
    </div>
  );
};

const ProfilePage = () => {
  const router = useRouter();
  const { user, status } = useAppSelector((state) => state.auth);

  useEffect(() => {
    if (status === "guest") router.replace("/login");
  }, [status, router]);

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-lg px-4 py-8">
        {status === "authenticated" && user ? (
          <ProfileForm user={user} />
        ) : (
          <div className="flex justify-center py-16 text-muted">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
      </main>
    </div>
  );
};

export default ProfilePage;
