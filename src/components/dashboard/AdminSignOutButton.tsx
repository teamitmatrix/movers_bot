"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

function ArrowLeftOnRectangleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
      <path fillRule="evenodd" d="M7.5 3.75A2.25 2.25 0 005.25 6v12a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0017.25 18V15a.75.75 0 011.5 0v3A3.75 3.75 0 0115 21.75H7.5A3.75 3.75 0 013.75 18V6A3.75 3.75 0 017.5 2.25H15A3.75 3.75 0 0118.75 6v3a.75.75 0 01-1.5 0V6A2.25 2.25 0 0015 3.75H7.5zm9.22 4.72a.75.75 0 011.06 0l3.75 3.75a.75.75 0 010 1.06l-3.75 3.75a.75.75 0 11-1.06-1.06l2.47-2.47H9a.75.75 0 010-1.5h10.19l-2.47-2.47a.75.75 0 010-1.06z" clipRule="evenodd" />
    </svg>
  );
}

export default function AdminSignOutButton({
  className = "",
}: {
  className?: string;
}) {
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    await signOut({ callbackUrl: "/login" });
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isSigningOut}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
        className,
      ].join(" ")}
    >
      <ArrowLeftOnRectangleIcon />
      {isSigningOut ? "Signing out..." : "Logout"}
    </button>
  );
}