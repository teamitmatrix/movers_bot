import type { Metadata } from "next";

import LegalPage from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | Vanturo",
  description: "Read Vanturo's privacy policy for how moving quote and booking information is collected and used.",
};

const sections = [
  {
    heading: "Information we collect",
    body: [
      "Vanturo collects the information you provide when requesting a moving quote or booking a move, including ZIP codes, inventory details, name, phone number, and optional email address.",
      "We may also collect limited technical data needed to operate the site securely, including session identifiers and rate-limit information.",
    ],
  },
  {
    heading: "How we use information",
    body: [
      "We use submitted information to generate moving quotes, respond to booking requests, manage customer conversations, and improve service operations.",
      "We do not use customer quote information for unrelated advertising claims inside the application flow.",
    ],
  },
  {
    heading: "Sharing and retention",
    body: [
      "Information is only shared when needed to provide moving services, support operations, comply with legal obligations, or protect the platform from abuse.",
      "Conversation sessions may be stored temporarily to support quote continuity and booking follow-up, then removed according to system retention rules.",
    ],
  },
  {
    heading: "Contact",
    body: [
      "For privacy questions, contact Vanturo at hello@vanturo.com or call (555) 100-2000.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      summary="This page explains how Vanturo collects, uses, and stores customer information submitted through quote requests, booking flows, and support interactions."
      sections={sections}
    />
  );
}