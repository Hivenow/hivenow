import Link from "next/link";

interface HiveLogoProps {
  roleLabel?: "ADMIN PANEL" | "DESIGNER PANEL" | "Seller Portal" | "SELLER CENTER" | string;
  href?: string;
  className?: string;
  size?: "sm" | "md";
}

const sizeClasses = {
  sm: "h-10 w-10 sm:h-12 sm:w-12",
  md: "h-12 w-12 sm:h-14 sm:w-14",
};

export function HiveLogo({ roleLabel, href = "/", className = "", size = "md" }: HiveLogoProps) {
  const displayLabel = roleLabel === "DESIGNER PANEL" ? "Seller Portal" : roleLabel;

  return (
    <Link href={href} className={`flex items-center gap-2 group ${className}`}>
      <div className={`relative shrink-0 overflow-hidden ${sizeClasses[size]} rounded-lg shadow-sm`}>
        <img 
          src="/logo-square.png?v=1"
          alt="Hive Logo" 
          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
        />
      </div>
      {displayLabel && (
        <div className="flex flex-col border-l border-hive-border/40 pl-3 py-1">
          <span className="text-[10px] sm:text-xs font-bold tracking-[0.2em] text-[#D9A71E] whitespace-nowrap leading-none font-sans">
            {displayLabel}
          </span>
        </div>
      )}
    </Link>
  );
}
