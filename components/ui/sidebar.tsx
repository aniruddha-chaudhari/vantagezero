"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { PanelLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type SidebarContextValue = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openMobile: boolean;
  setOpenMobile: React.Dispatch<React.SetStateAction<boolean>>;
  state: "expanded" | "collapsed";
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used inside SidebarProvider");
  return context;
}

function SidebarProvider({ className, children, ...props }: React.ComponentProps<"div">) {
  const [open, setOpen] = React.useState(true);
  const [openMobile, setOpenMobile] = React.useState(false);

  const toggleSidebar = React.useCallback(() => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      setOpen((value) => !value);
      return;
    }

    setOpenMobile((value) => !value);
  }, []);

  const value = React.useMemo(
    () => ({
      open,
      setOpen,
      openMobile,
      setOpenMobile,
      state: open ? ("expanded" as const) : ("collapsed" as const),
      toggleSidebar,
    }),
    [open, openMobile, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={value}>
      <div className={cn("flex min-h-svh w-full bg-background", className)} {...props}>
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

function Sidebar({ className, children, ...props }: React.ComponentProps<"aside">) {
  const { open, openMobile, setOpenMobile, state } = useSidebar();

  return (
    <>
      {openMobile && (
        <button
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={() => setOpenMobile(false)}
        />
      )}
      <aside
        data-state={state}
        className={cn(
          "group/sidebar fixed inset-y-0 left-0 z-50 flex w-[260px] shrink-0 -translate-x-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200 ease-out lg:sticky lg:top-0 lg:h-svh lg:translate-x-0",
          !open && "lg:w-16",
          openMobile && "translate-x-0",
          className,
        )}
        {...props}
      >
        {children}
      </aside>
    </>
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 p-4 group-data-[state=collapsed]/sidebar:items-center group-data-[state=collapsed]/sidebar:p-2",
        className,
      )}
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-3 group-data-[state=collapsed]/sidebar:overflow-hidden",
        className,
      )}
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 p-3 group-data-[state=collapsed]/sidebar:[&>*:not(ul)]:hidden",
        className,
      )}
      {...props}
    />
  );
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 py-2", className)} {...props} />;
}

function SidebarGroupLabel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "px-2 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground transition-[opacity,height,padding] duration-200 group-data-[state=collapsed]/sidebar:h-0 group-data-[state=collapsed]/sidebar:overflow-hidden group-data-[state=collapsed]/sidebar:p-0 group-data-[state=collapsed]/sidebar:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

function SidebarGroupContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("w-full", className)} {...props} />;
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul className={cn("flex w-full flex-col gap-1", className)} {...props} />;
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li className={cn("relative", className)} {...props} />;
}

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  className,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean; isActive?: boolean }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-active={isActive}
      className={cn(
        "flex h-9 w-full items-center gap-2 overflow-hidden rounded-md px-2.5 text-sm text-sidebar-foreground/70 transition-[background-color,color,width,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground group-data-[state=collapsed]/sidebar:mx-auto group-data-[state=collapsed]/sidebar:size-9 group-data-[state=collapsed]/sidebar:justify-center group-data-[state=collapsed]/sidebar:gap-0 group-data-[state=collapsed]/sidebar:px-0 group-data-[state=collapsed]/sidebar:text-[0px] [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return <main className={cn("min-w-0 flex-1 bg-background", className)} {...props} />;
}

function SidebarTrigger({ className, onClick, ...props }: React.ComponentProps<typeof Button>) {
  const { toggleSidebar, state } = useSidebar();

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("shrink-0 self-end group-data-[state=collapsed]/sidebar:self-center", className)}
      aria-label={state === "expanded" ? "Collapse sidebar" : "Expand sidebar"}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) toggleSidebar();
      }}
      {...props}
    >
      <PanelLeft />
    </Button>
  );
}

function SidebarSeparator({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mx-3 h-px bg-sidebar-border", className)} {...props} />;
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
};
