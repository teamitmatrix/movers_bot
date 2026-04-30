import OrderDetailsView from "@/components/dashboard/OrderDetailsView";
import PageUpButton from "@/components/shared/PageUpButton";

export default async function OrderDetailsPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <>
      <main className="mx-auto flex min-h-screen max-w-4xl px-6 py-20">
        <OrderDetailsView id={params.id} />
      </main>
      <PageUpButton className="border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]" />
    </>
  );
}