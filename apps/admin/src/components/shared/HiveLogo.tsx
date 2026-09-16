import Image from "next/image";
import Link from "next/link";

interface HiveLogoProps {
  roleLabel?: "ADMIN PANEL" | "DESIGNER PANEL" | "Seller Portal" | "SELLER CENTER" | string;
  href?: string;
  className?: string;
  size?: "sm" | "md";
}

const sizeClasses = {
  sm: "h-4 sm:h-5",
  md: "h-5 sm:h-7",
};

export function HiveLogo({ roleLabel, href = "/", className = "", size = "md" }: HiveLogoProps) {
  const displayLabel = roleLabel === "DESIGNER PANEL" ? "Seller Portal" : roleLabel;

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 hover:opacity-85 active:scale-[0.98] transition-all duration-200 cursor-pointer ${className}`}
    >
      <Image
        src="/logo.png"
        alt="Hive"
        width={180}
        height={75}
        priority
        className={`${sizeClasses[size]} w-auto object-contain`}
      />
      {displayLabel && (
        <div className="flex flex-col border-l border-hive-border/40 pl-3 py-1">
          <span className="text-[10px] sm:text-xs font-bold tracking-[0.2em] text-hive-gold whitespace-nowrap leading-none font-sans">
            {displayLabel}
          </span>
        </div>
      )}
    </Link>
  );
}
