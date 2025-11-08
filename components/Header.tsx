"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Video, Camera, Folder } from "lucide-react";

// Helper for styling the active link
const NavLink = ({ href, children }: { href: string; children: React.ReactNode }) => {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link href={href} className={`
      flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium
      transition-colors
      ${isActive
        ? 'bg-gray-800 text-white'
        : 'text-gray-400 hover:bg-gray-700 hover:text-white'
      }
    `}>
      {children}
    </Link>
  );
};

export function Header() {
  return (
    <nav className="w-full h-16 bg-gray-900 border-b border-gray-700">
      <div className="max-w-7xl mx-auto h-full flex justify-between items-center px-4">
        {/* Logo */}
        <Link href="/" className="text-xl font-bold text-white">
          ViewGuard
        </Link>

        {/* Navigation Links */}
        <div className="flex items-center gap-4">
          <NavLink href="/realtime-stream">
            <Camera className="w-4 h-4" />
            Live Analysis
          </NavLink>
          <NavLink href="/saved-videos">
            <Folder className="w-4 h-4" />
            Saved Videos
          </NavLink>
          {/* Add this link once the upload page is built */}
          {/* <NavLink href="/upload">
            <Upload className="w-4 h-4" />
            Upload
          </NavLink> */}
        </div>

        {/* User/Auth section (placeholder) */}
        <div className="w-8 h-8 rounded-full bg-gray-700" />
      </div>
    </nav>
  );
}
