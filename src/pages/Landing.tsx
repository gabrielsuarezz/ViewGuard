import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
const Landing = () => {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/10" />
      
      {/* Animated orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />

      {/* Content */}
      <div className="relative z-10 text-center space-y-16 px-4">
        {/* Title with Glow */}
        <div className="space-y-2">
          <h1 className="text-8xl md:text-9xl font-bold tracking-tight leading-none">
            <span className="inline-block text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.5)]">View</span>
            <span className="inline-block text-primary drop-shadow-[0_0_50px_hsl(var(--primary))]">Guard</span>
          </h1>
          <p className="text-muted-foreground text-lg md:text-xl tracking-widest font-light">
            ADVANCED SURVEILLANCE SYSTEM
          </p>
        </div>

        {/* CTA Button */}
        <div>
          <Button 
            asChild 
            size="lg" 
            className="group relative text-lg px-14 py-7 h-auto rounded-full bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:from-primary/90 hover:to-primary/70 transition-all duration-500 shadow-[0_0_40px_hsl(var(--primary)/0.6)] hover:shadow-[0_0_60px_hsl(var(--primary)/0.9)] hover:scale-110 font-semibold tracking-wide"
          >
            <Link to="/monitor" className="flex items-center gap-3">
              <span className="relative z-10">Get Started</span>
              <span className="text-2xl transition-transform duration-500 group-hover:translate-x-1">→</span>
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/0 via-white/20 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};
export default Landing;