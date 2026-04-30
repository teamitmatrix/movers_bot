import type { Metadata } from "next";

import LegalPage from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service | Vanturo",
  description: "Read Vanturo's terms of service for use of the website, quote flow, and booking process.",
};

const sections = [
  {
    heading: "Use of the service",
    body: [
      "Vanturo provides quote and booking tools to help customers request moving services. Quotes are estimates based on the information submitted and may change if job details change.",
      "You agree to provide accurate information about locations, inventory, scheduling, and contact details when using the platform.",
    ],
  },
  {
    heading: "Bookings and pricing",
    body: [
      "Pricing shown during the quote flow is based on the details entered at the time of the request. Final service terms depend on confirmed booking details and operational review.",
      "Submitting a booking request does not waive the requirement to provide truthful and complete move information.",
    ],
  },
  {
    heading: "Acceptable use",
    body: [
      "You may not use the site to submit false bookings, abuse automated systems, interfere with platform availability, or attempt unauthorized access to protected routes or data.",
    ],
  },
  {
    heading: "Contact",
    body: [
      "Questions about these terms can be sent to support@vanturo.com or discussed by phone at 1-800-123-4567.",
    ],
  },
];

export default function TermsOfServicePage() {
  return (
    <LegalPage
      title="Terms of Service"
      summary="These terms describe the rules that apply when using Vanturo's website, quote assistant, and booking workflow."
      sections={sections}
    />
  );
}