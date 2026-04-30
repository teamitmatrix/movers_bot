import OrdersDashboard from "@/components/dashboard/OrdersDashboard";
import PageUpButton from "@/components/shared/PageUpButton";

export default async function DashboardPage() {
  return (
    <>
      <main className="mx-auto flex min-h-screen max-w-4xl px-6 py-20">
        <OrdersDashboard />
      </main>
      <PageUpButton className="border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]" />
    </>
  );
}