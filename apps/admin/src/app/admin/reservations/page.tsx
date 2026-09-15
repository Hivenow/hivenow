"use client";

import React, { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../../convex/_generated/api";
import { Card, CardContent } from "@hive/ui";
import { formatRupees } from "@hive/utils";
import { ShoppingBag, Search, Filter, Loader2, Clock, CheckCircle, XCircle } from "lucide-react";
import { useAuth } from "@clerk/nextjs";

function ReservationStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    reservation_active: "bg-blue-50 text-blue-700 border-blue-200",
    awaiting_store_confirmation: "bg-amber-50 text-amber-700 border-amber-200",
    reservation_confirmed: "bg-indigo-50 text-indigo-700 border-indigo-200",
    awaiting_payment: "bg-purple-50 text-purple-700 border-purple-200",
    payment_expired: "bg-slate-50 text-slate-700 border-slate-200",
    unavailable: "bg-red-50 text-red-700 border-red-200",
    reservation_expired: "bg-slate-50 text-slate-700 border-slate-200",
    order_confirmed: "bg-green-50 text-green-700 border-green-200",
    cancelled: "bg-slate-50 text-slate-700 border-slate-200",
  };
  const cls = map[status] || "bg-slate-50 text-slate-600 border-slate-200";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${cls}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function AdminReservationsPage() {
  const { getToken } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  React.useEffect(() => {
    getToken().then(setToken);
  }, [getToken]);

  const reservations = useQuery(
    api.reservations.getAllReservations_admin,
    token ? { token } : "skip"
  );

  const STATUS_OPTIONS = [
    { value: "all", label: "All Statuses" },
    { value: "reservation_active", label: "Active" },
    { value: "awaiting_store_confirmation", label: "Awaiting Confirmation" },
    { value: "awaiting_payment", label: "Awaiting Payment" },
    { value: "order_confirmed", label: "Order Confirmed" },
    { value: "unavailable", label: "Unavailable" },
    { value: "reservation_expired", label: "Expired" },
  ];

  if (!token || reservations === undefined) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-hive-amber" />
      </div>
    );
  }

  const filtered = reservations.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        r.productName.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        r.boutiqueName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 flex flex-col gap-6 max-w-7xl mx-auto w-full">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl sm:text-3xl font-serif font-black text-hive-dark">
          Reservations
        </h1>
        <p className="text-xs sm:text-sm text-hive-text-muted max-w-2xl">
          Track next-day reservations across all boutiques.
        </p>
      </div>

      {/* Filters Row */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by product, customer, boutique..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-hive-border/60 rounded-xl focus:outline-none focus:ring-1.5 focus:ring-hive-gold bg-white"
          />
        </div>

        <div className="relative">
          <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="pl-8 pr-4 py-2 text-sm border border-hive-border/60 rounded-xl focus:outline-none focus:ring-1.5 focus:ring-hive-gold bg-white appearance-none"
          >
            {STATUS_OPTIONS.map((opt) => (
               <option key={opt.value} value={opt.value}>
                 {opt.label}
               </option>
            ))}
          </select>
        </div>

        <span className="text-xs text-hive-text-muted ml-auto">
          {filtered.length} of {reservations.length} reservations
        </span>
      </div>

      {/* Table */}
      <Card className="border border-hive-border bg-white shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-hive-border/40 text-[10px] font-bold uppercase tracking-wider text-hive-text-muted">
                  <th className="px-5 py-4">Date</th>
                  <th className="px-5 py-4">Customer</th>
                  <th className="px-5 py-4">Boutique</th>
                  <th className="px-5 py-4">Product</th>
                  <th className="px-5 py-4">Size & Qty</th>
                  <th className="px-5 py-4">Amount</th>
                  <th className="px-5 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hive-border/30 font-medium text-hive-dark">
                {filtered.map((res) => (
                  <tr
                    key={res._id}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="px-5 py-4 whitespace-nowrap text-hive-text-muted">
                      {new Date(res.createdAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </td>
                    <td className="px-5 py-4 max-w-[140px] truncate">
                      {res.customerName}
                    </td>
                    <td className="px-5 py-4 max-w-[140px] truncate text-hive-text-muted">
                      {res.boutiqueName}
                    </td>
                    <td className="px-5 py-4 max-w-[200px] truncate">
                      {res.productName}
                    </td>
                    <td className="px-5 py-4">
                      {res.size} × {res.quantity}
                    </td>
                    <td className="px-5 py-4 font-bold whitespace-nowrap">
                      {/* Rupees: getAllReservations_admin converts the stored paise. */}
                      {formatRupees(res.priceAtReserve)}
                    </td>
                    <td className="px-5 py-4">
                      <ReservationStatusBadge status={res.status} />
                    </td>
                  </tr>
                ))}

                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center text-hive-text-muted"
                    >
                      <div className="flex flex-col items-center gap-3">
                        <ShoppingBag className="w-8 h-8 text-slate-300" />
                        <span className="text-sm font-semibold">
                          No reservations found
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
