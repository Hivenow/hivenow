import React from "react";
import { cn } from "../utils/cn";

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
  variant?: "comb" | "underline" | "pills";
}

export const Tabs: React.FC<TabsProps> = ({
  items,
  activeId,
  onChange,
  className,
  variant = "underline",
}) => {
  return (
    <div
      className={cn(
        "flex w-full overflow-x-auto scrollbar-none border-b border-hive-border/60",
        variant === "comb" && "bg-hive-comb/10 p-1.5 rounded-2xl border-none",
        variant === "pills" && "border-none p-1 bg-slate-100 rounded-xl",
        className
      )}
    >
      <div className="flex gap-2 w-full">
        {items.map((tab) => {
          const isActive = tab.id === activeId;

          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-3.5 text-sm font-semibold tracking-wide border-b-2 border-transparent text-hive-text-muted hover:text-hive-text transition-all duration-200 relative whitespace-nowrap",
                isActive && "text-hive-gold border-hive-gold font-bold",
                
                variant === "comb" &&
                  "border-none rounded-xl px-4 py-2.5 text-xs text-hive-text-muted hover:bg-hive-cream/80",
                variant === "comb" && isActive && "bg-white text-hive-text shadow-sm font-bold border border-hive-border",

                variant === "pills" &&
                  "border-none rounded-lg px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900",
                variant === "pills" && isActive && "bg-white text-stone-900 shadow-sm font-semibold"
              )}
            >
              {tab.icon && <span className="w-4 h-4">{tab.icon}</span>}
              {tab.label}
              {typeof tab.count === "number" && (
                <span
                  className={cn(
                    "ml-1 text-[10px] font-black px-1.5 py-0.5 rounded-full bg-hive-cream text-hive-text-muted",
                    isActive && "bg-hive-gold/20 text-hive-text"
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
