"use client";

import React from 'react';
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent, Input } from '@hive/ui';
import { Scissors, Truck, IndianRupee, Hexagon } from 'lucide-react';


export default function WaitlistPage() {
  return (
    <div className="min-h-screen bg-hive-cream flex flex-col font-sans overflow-x-hidden">
      {/* Header / Logo */}
      <header className="w-full p-6 flex justify-between items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-2 font-serif text-2xl font-bold text-hive-dark">
          <Hexagon className="w-8 h-8 text-hive-gold fill-hive-gold/20" />
          <span>Hive</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center max-w-7xl mx-auto w-full px-6 py-12 md:py-20 gap-20">
        
        {/* Hero Section */}
        <section className="flex flex-col items-center text-center max-w-4xl gap-6">
          <div className="inline-flex items-center rounded-full border border-hive-gold/30 bg-hive-gold/10 px-4 py-1.5 text-sm font-medium text-hive-amber mb-4 shadow-sm">
            <span className="flex h-2 w-2 rounded-full bg-hive-gold mr-2 animate-pulse-soft"></span>
            Launching Soon in Select Cities
          </div>
          
          <h1 className="text-5xl md:text-7xl font-serif font-bold text-hive-dark tracking-tight leading-[1.15]">
            Hyper-Local Tailoring, <br className="hidden md:block"/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-hive-amber to-hive-gold">
              Doorstep Delivery.
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-hive-text-muted max-w-2xl mt-4 leading-relaxed">
            Get the perfect fit without leaving your home. We connect you with top-tier local brands and stores for premium clothing, transparent pricing, and fast logistics.
          </p>
          
          {/* Email Input & CTA */}
          <form className="flex flex-col sm:flex-row gap-3 w-full max-w-md mt-8 relative z-10 group" onSubmit={(e) => e.preventDefault()}>
            <Input 
              type="email" 
              placeholder="Enter your email address" 
              className="flex-1 h-13 rounded-2xl border-hive-border focus:border-hive-gold focus:ring-hive-gold/20 bg-white/80 backdrop-blur-sm shadow-sm transition-all duration-300 px-5 text-base"
              required
            />
            <Button type="submit" size="lg" className="h-13 w-full sm:w-auto shadow-md hover:shadow-lg whitespace-nowrap">
              Join Waitlist
            </Button>
          </form>
          <p className="text-xs text-hive-text-muted mt-3 font-medium">
            Be the first to know when we launch in your area. No spam, ever.
          </p>
        </section>

        {/* Mascot Placeholder */}
        <section className="relative w-full max-w-2xl aspect-[21/9] md:aspect-video rounded-3xl border-2 border-dashed border-hive-border/60 bg-hive-comb/30 flex flex-col items-center justify-center p-8 group overflow-hidden">
           <div className="absolute inset-0 bg-gradient-to-br from-hive-gold/5 via-transparent to-hive-amber/5 rounded-3xl opacity-50 group-hover:opacity-100 transition-opacity duration-700"></div>
           <div className="relative z-10 flex flex-col items-center">
             <div className="p-4 bg-white/50 rounded-2xl shadow-sm mb-4 backdrop-blur-sm border border-white">
               <Hexagon className="w-12 h-12 text-hive-gold/60 group-hover:scale-110 group-hover:text-hive-amber transition-all duration-500 ease-out" strokeWidth={1.5} />
             </div>
             <h3 className="text-hive-text font-serif font-bold text-lg">Worker Bee Mascot</h3>
             <p className="mt-1 text-hive-text-muted font-medium text-sm text-center max-w-sm">
               [Structural placeholder ready for SVG or Framer Motion wrapper]
             </p>
           </div>
        </section>

        {/* Feature Row */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full mt-4">
          <Card variant="glass" className="hover:-translate-y-2 hover:shadow-xl hover:shadow-hive-gold/5 transition-all duration-500 border-white/60 bg-white/40">
            <CardHeader className="border-b-0 pb-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-hive-gold/20 to-hive-amber/10 flex items-center justify-center mb-6 shadow-inner">
                <Scissors className="w-7 h-7 text-hive-amber" />
              </div>
              <CardTitle className="text-2xl font-serif">Premium Tailoring</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <CardDescription className="text-base leading-relaxed text-hive-text-muted">
                Expert craftsmanship from vetted local brands and stores. We ensure every stitch meets our rigorous quality standards for the perfect fit.
              </CardDescription>
            </CardContent>
          </Card>

          <Card variant="glass" className="hover:-translate-y-2 hover:shadow-xl hover:shadow-hive-gold/5 transition-all duration-500 border-white/60 bg-white/40">
            <CardHeader className="border-b-0 pb-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-hive-gold/20 to-hive-amber/10 flex items-center justify-center mb-6 shadow-inner">
                <IndianRupee className="w-7 h-7 text-hive-amber" />
              </div>
              <CardTitle className="text-2xl font-serif">Tiered Pricing</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <CardDescription className="text-base leading-relaxed text-hive-text-muted">
                Clear, transparent pricing with absolutely no hidden fees. Know exactly what you are paying for before placing your order.
              </CardDescription>
            </CardContent>
          </Card>

          <Card variant="glass" className="hover:-translate-y-2 hover:shadow-xl hover:shadow-hive-gold/5 transition-all duration-500 border-white/60 bg-white/40">
            <CardHeader className="border-b-0 pb-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-hive-gold/20 to-hive-amber/10 flex items-center justify-center mb-6 shadow-inner">
                <Truck className="w-7 h-7 text-hive-amber" />
              </div>
              <CardTitle className="text-2xl font-serif">Fast Logistics</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <CardDescription className="text-base leading-relaxed text-hive-text-muted">
                Seamless doorstep pickup of your fabric and sample garment, with quick, reliable delivery of your finalized product.
              </CardDescription>
            </CardContent>
          </Card>
        </section>
      </main>
      
      <footer className="w-full py-8 px-6 text-center text-hive-text-muted text-sm border-t border-hive-border/50 bg-white/50 backdrop-blur-sm mt-auto">
        <p>© {new Date().getFullYear()} Hive. All rights reserved.</p>
      </footer>
    </div>
  );
}
