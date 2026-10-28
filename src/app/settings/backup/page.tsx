import type { Metadata } from "next";
import { ProfileBackup } from "@/components/settings/profile-backup";

export const metadata: Metadata = { title: "Profile backup" };
export default function ProfileBackupPage() {
  return <ProfileBackup />;
}
