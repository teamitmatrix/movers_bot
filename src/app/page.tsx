"use client";

import ChatWidget from "@/components/chat/ChatModal";
import AboutSection from "@/components/landing/AboutSection";
import Footer from "@/components/landing/Footer";
import HeroSection from "@/components/landing/HeroSection";
import Navbar from "@/components/landing/Navbar";
import PricingHint from "@/components/landing/PricingHint";
import ServicesSection from "@/components/landing/ServicesSection";
import TrustSection from "@/components/landing/TrustSection";
import PageUpButton from "@/components/shared/PageUpButton";

function openChat() {
  window.dispatchEvent(new CustomEvent("open-chat"));
}

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSection onQuoteClick={openChat} />
        <AboutSection />
        <ServicesSection />
        <TrustSection />
        <PricingHint onQuoteClick={openChat} />
      </main>
      <Footer />
      <PageUpButton className="border-white/70 bg-white/95 text-slate-900" />
      <ChatWidget />
    </>
  );
}

