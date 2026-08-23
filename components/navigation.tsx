"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";

const navLinks = [
  { name: "Product", href: "#product" },
  { name: "How it works", href: "#how-it-works" },
  { name: "Demo", href: "https://www.youtube.com/watch?v=BlsxOLZN47E" },
  { name: "GitHub", href: "https://github.com/aniruddha-chaudhari/vantagezero" },
];

export function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed z-50 transition-[top,left,right] duration-500 ease-out ${
        isScrolled ? "left-3 right-3 top-3" : "left-0 right-0 top-0"
      }`}
    >
      <nav
        className={`mx-auto transition-[max-width,background-color,box-shadow,border-radius] duration-500 ease-out ${
          isScrolled || isMobileMenuOpen
            ? "max-w-[1240px] rounded-xl bg-white/92 shadow-[0_12px_42px_rgba(0,0,0,0.055)] backdrop-blur-xl dark:bg-black/80 dark:shadow-[0_12px_42px_rgba(0,0,0,0.35)]"
            : "max-w-[1500px] bg-transparent shadow-none"
        }`}
      >
        <div
          className={`flex items-center justify-between px-6 transition-[height] duration-500 ease-out lg:px-10 ${
            isScrolled ? "h-14" : "h-[88px]"
          }`}
        >
          <a href="#" className="text-[23px] font-semibold tracking-[-0.045em] text-black dark:text-white sm:text-[25px]">
            Vantage
          </a>

          <div className="hidden items-center gap-11 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                target={link.name === "GitHub" || link.name === "Demo" ? "_blank" : undefined}
                rel={link.name === "GitHub" || link.name === "Demo" ? "noreferrer" : undefined}
                className="group relative text-sm font-medium tracking-[-0.015em] text-black/62 transition-colors duration-300 hover:text-black dark:text-white/62 dark:hover:text-white"
              >
                {link.name}
                <span className="absolute -bottom-1.5 left-0 h-px w-0 bg-black transition-all duration-300 group-hover:w-full dark:bg-white" />
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <ThemeToggle />
            <a
              href="/dashboard"
              className={`inline-flex items-center justify-center bg-black font-medium text-white transition-[height,padding,border-radius,font-size,transform,background-color] duration-500 ease-out hover:-translate-y-px hover:bg-black/88 dark:bg-white dark:text-black dark:hover:bg-white/88 ${
                isScrolled
                  ? "h-9 rounded-lg px-5 text-xs"
                  : "h-11 rounded-[10px] px-7 text-sm"
              }`}
            >
              Get started
            </a>
          </div>

          <div className="flex items-center gap-1 md:hidden">
            <ThemeToggle />
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 text-black dark:text-white"
              aria-label="Toggle menu"
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </nav>

      <div
        className={`fixed inset-0 z-40 bg-white transition-opacity duration-500 dark:bg-black md:hidden ${
          isMobileMenuOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      >
        <div className="flex h-full flex-col px-8 pb-8 pt-28">
          <div className="flex flex-1 flex-col justify-center gap-8">
            {navLinks.map((link, i) => (
              <a
                key={link.name}
                href={link.href}
                target={link.name === "GitHub" || link.name === "Demo" ? "_blank" : undefined}
                rel={link.name === "GitHub" || link.name === "Demo" ? "noreferrer" : undefined}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`font-display text-5xl text-black transition-all duration-500 hover:text-black/55 dark:text-white dark:hover:text-white/55 ${
                  isMobileMenuOpen
                    ? "translate-y-0 opacity-100"
                    : "translate-y-4 opacity-0"
                }`}
                style={{
                  transitionDelay: isMobileMenuOpen ? `${i * 75}ms` : "0ms",
                }}
              >
                {link.name}
              </a>
            ))}
          </div>

          <div
            className={`border-t border-black/10 pt-8 transition-all duration-500 dark:border-white/10 ${
              isMobileMenuOpen
                ? "translate-y-0 opacity-100"
                : "translate-y-4 opacity-0"
            }`}
            style={{ transitionDelay: isMobileMenuOpen ? "300ms" : "0ms" }}
          >
            <a
              href="/dashboard"
              onClick={() => setIsMobileMenuOpen(false)}
              className="inline-flex h-14 w-full items-center justify-center rounded-xl bg-black text-base font-medium text-white dark:bg-white dark:text-black"
            >
              Get started
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
