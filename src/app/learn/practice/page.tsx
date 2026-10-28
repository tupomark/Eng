import { Suspense } from "react";
import { Practice } from "@/components/practice";
export default function PracticePage() {
  return (
    <Suspense fallback={<p role="status">Opening practice…</p>}>
      <Practice />
    </Suspense>
  );
}
