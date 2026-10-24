import { DocumentReader } from "@/components/materials/document-reader";
export default async function Page({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  return <DocumentReader documentId={documentId} />;
}
