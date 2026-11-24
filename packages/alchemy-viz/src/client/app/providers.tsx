import { createTooltipController, Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/react/tooltip";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cloneElement, type CSSProperties, type ReactElement, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { easeOut } from "../../ui/easing.ts";

/**
 * Who provides a resource, read from the first segment of its type
 * (`Cloudflare.KV.Namespace` → Cloudflare). Known providers get their own
 * mark and color (`--av-prov-<id>` in theme.css). Any other prefix, like a
 * team's own `Acme.FeatureFlags`, gets a neutral hollow mark in a gray that
 * belongs to no one, so custom resources sit quietly next to branded ones.
 */
export interface ProviderInfo {
  id: string,
  label: string,
  /** Path of a one-color mark on a 24×24 grid. Missing for custom providers. */
  icon?: string
}

// Marks are from Simple Icons (CC0). They identify the services; they aren't ours.
const known: Record<string, { label: string, icon: string, aliases?: string[] }> = {
  cloudflare: { label: "Cloudflare", icon: "M16.509 16.845c.147-.507.09-.971-.155-1.316c-.225-.316-.605-.499-1.062-.52l-8.66-.113a.16.16 0 0 1-.133-.07a.2.2 0 0 1-.02-.156a.24.24 0 0 1 .203-.156l8.736-.113c1.035-.049 2.16-.886 2.554-1.913l.499-1.302a.27.27 0 0 0 .014-.168a5.689 5.689 0 0 0-10.937-.584a2.58 2.58 0 0 0-1.794-.498a2.56 2.56 0 0 0-2.223 3.18A3.634 3.634 0 0 0 0 16.751q.002.264.035.527a.174.174 0 0 0 .17.148h15.98a.22.22 0 0 0 .204-.155zm2.757-5.564c-.077 0-.161 0-.239.011c-.056 0-.105.042-.127.098l-.337 1.174c-.148.507-.092.971.154 1.317c.225.316.605.498 1.062.52l1.844.113c.056 0 .105.026.133.07a.2.2 0 0 1 .021.156a.24.24 0 0 1-.204.156l-1.92.112c-1.042.049-2.159.887-2.553 1.914l-.141.358c-.028.072.021.142.099.142h6.597a.174.174 0 0 0 .17-.126a5 5 0 0 0 .175-1.28a4.74 4.74 0 0 0-4.734-4.727" },
  aws: { label: "AWS", icon: "M6.763 10.036q.002.446.088.71c.064.176.144.368.256.576c.04.063.056.127.056.183q.002.12-.152.24l-.503.335a.4.4 0 0 1-.208.072q-.12-.002-.239-.112a2.5 2.5 0 0 1-.287-.375a6 6 0 0 1-.248-.471q-.934 1.101-2.347 1.101c-.67 0-1.205-.191-1.596-.574q-.588-.575-.59-1.533c0-.678.239-1.23.726-1.644c.487-.415 1.133-.623 1.955-.623c.272 0 .551.024.846.064c.296.04.6.104.918.176v-.583q-.001-.909-.375-1.277c-.255-.248-.686-.367-1.3-.367c-.28 0-.568.031-.863.103q-.443.106-.862.272a2 2 0 0 1-.28.104a.5.5 0 0 1-.127.023q-.168.002-.168-.247v-.391c0-.128.016-.224.056-.28a.6.6 0 0 1 .224-.167a4.6 4.6 0 0 1 1.005-.36a4.8 4.8 0 0 1 1.246-.151c.95 0 1.644.216 2.091.647q.66.645.662 1.963v2.586zm-3.24 1.214c.263 0 .534-.048.822-.144a1.8 1.8 0 0 0 .758-.51a1.3 1.3 0 0 0 .272-.512c.047-.191.08-.423.08-.694v-.335a7 7 0 0 0-.735-.136a6 6 0 0 0-.75-.048c-.535 0-.926.104-1.19.32c-.263.215-.39.518-.39.917c0 .375.095.655.295.846c.191.2.47.296.838.296m6.41.862c-.144 0-.24-.024-.304-.08c-.064-.048-.12-.16-.168-.311L7.586 5.55a1.4 1.4 0 0 1-.072-.32c0-.128.064-.2.191-.2h.783q.227-.001.31.08c.065.048.113.16.16.312l1.342 5.284l1.245-5.284q.058-.24.151-.312a.55.55 0 0 1 .32-.08h.638c.152 0 .256.025.32.08c.063.048.12.16.151.312l1.261 5.348l1.381-5.348q.074-.24.16-.312a.52.52 0 0 1 .311-.08h.743c.127 0 .2.065.2.2c0 .04-.009.08-.017.128a1 1 0 0 1-.056.2l-1.923 6.17q-.072.24-.168.311a.5.5 0 0 1-.303.08h-.687c-.151 0-.255-.024-.32-.08c-.063-.056-.119-.16-.15-.32l-1.238-5.148l-1.23 5.14c-.04.16-.087.264-.15.32c-.065.056-.177.08-.32.08zm10.256.215c-.415 0-.83-.048-1.229-.143c-.399-.096-.71-.2-.918-.32c-.128-.071-.215-.151-.247-.223a.6.6 0 0 1-.048-.224v-.407c0-.167.064-.247.183-.247q.072 0 .144.024c.048.016.12.048.2.08q.408.181.878.279c.319.064.63.096.95.096c.502 0 .894-.088 1.165-.264a.86.86 0 0 0 .415-.758a.78.78 0 0 0-.215-.559c-.144-.151-.416-.287-.807-.415l-1.157-.36c-.583-.183-1.014-.454-1.277-.813a1.9 1.9 0 0 1-.4-1.158q0-.502.216-.886c.144-.255.335-.479.575-.654c.24-.184.51-.32.83-.415c.32-.096.655-.136 1.006-.136c.175 0 .359.008.535.032c.183.024.35.056.518.088q.24.058.455.127q.216.072.336.144a.7.7 0 0 1 .24.2a.43.43 0 0 1 .071.263v.375q-.002.254-.184.256a.8.8 0 0 1-.303-.096a3.65 3.65 0 0 0-1.532-.311c-.455 0-.815.071-1.062.223s-.375.383-.375.71c0 .224.08.416.24.567c.159.152.454.304.877.44l1.134.358c.574.184.99.44 1.237.767s.367.702.367 1.117c0 .343-.072.655-.207.926a2.2 2.2 0 0 1-.583.703c-.248.2-.543.343-.886.447c-.36.111-.734.167-1.142.167m1.509 3.88c-2.626 1.94-6.442 2.969-9.722 2.969c-4.598 0-8.74-1.7-11.87-4.526c-.247-.223-.024-.527.272-.351c3.384 1.963 7.559 3.153 11.877 3.153c2.914 0 6.114-.607 9.06-1.852c.439-.2.814.287.383.607m1.094-1.246c-.336-.43-2.22-.207-3.074-.103c-.255.032-.295-.192-.063-.36c1.5-1.053 3.967-.75 4.254-.399c.287.36-.08 2.826-1.485 4.007c-.215.184-.423.088-.327-.151c.32-.79 1.03-2.57.695-2.994", aliases: ["amazon"] },
  gcp: { label: "Google Cloud", icon: "M12.19 2.38a9.344 9.344 0 0 0-9.234 6.893c.053-.02-.055.013 0 0c-3.875 2.551-3.922 8.11-.247 10.941l.006-.007l-.007.03a6.7 6.7 0 0 0 4.077 1.356h5.173l.03.03h5.192c6.687.053 9.376-8.605 3.835-12.35a9.37 9.37 0 0 0-2.821-4.552l-.043.043l.006-.05A9.34 9.34 0 0 0 12.19 2.38m-.358 4.146c1.244-.04 2.518.368 3.486 1.15a5.19 5.19 0 0 1 1.862 4.078v.518c3.53-.07 3.53 5.262 0 5.193h-5.193l-.008.009v-.04H6.785a2.6 2.6 0 0 1-1.067-.23h.001a2.597 2.597 0 1 1 3.437-3.437l3.013-3.012A6.75 6.75 0 0 0 8.11 8.24c.018-.01.04-.026.054-.023a5.2 5.2 0 0 1 3.67-1.69z", aliases: ["google", "googlecloud"] },
  fly: { label: "Fly.io", icon: "M11.987 0c-2.45-.01-5.002.925-6.541 2.897c-1.17 1.502-1.664 3.474-1.49 5.356c.29 2.112 1.476 3.96 2.676 5.672a41.5 41.5 0 0 0 4.216 4.831c-1.063.832-1.943 2.286-1.357 3.644c.821 2.32 4.665 2.05 5.122-.372c.39-1.288-.694-2.533-1.428-3.309c2.388-2.431 4.706-5.036 6.17-8.145c.595-1.32.902-2.802.614-4.24c-.28-2.341-1.823-4.473-3.967-5.46C14.76.266 13.364.016 11.987 0m-.236 1.577v15.534C9.881 13.483 7.724 9.266 8.73 5.069c.35-1.539 1.253-3.309 3.02-3.492m1.996.04c1.534.357 3.031 1.096 3.906 2.48c1.3 1.93 1.318 4.55.1 6.521c-1.268 2.395-3.06 4.463-4.916 6.415c1.472-2.974 3.074-6.106 3.182-9.5c-.043-2.08-.438-4.612-2.272-5.916M11.97 20.103c.848.342 1.597 1.983.153 2.173c-.664.15-1.367-.599-.995-1.222c.213-.355.488-.73.842-.95", aliases: ["flyio"] },
  hetzner: { label: "Hetzner", icon: "M0 0v24h24V0zm4.602 4.025h2.244c.509 0 .716.215.716.717v5.64h8.883v-5.64c0-.509.215-.717.717-.717h2.229c.5 0 .71.23.724.717v14.516c0 .509-.215.717-.717.717h-2.23c-.51 0-.717-.215-.717-.717v-5.735H7.562v5.735c0 .516-.215.717-.716.717H4.602c-.51 0-.717-.208-.717-.717V4.742c0-.509.207-.717.717-.717" },
  neon: { label: "Neon", icon: "M24 0v24l-9.365-8.045V24H0V0ZM2.942 21.087h8.751V9.563l9.365 8.204V2.919L2.942 2.914Z" },
  turso: { label: "Turso", icon: "m23.31.803l-.563-.42l-1.11 1.189l-.891-1.286l-.512.235l.704 1.798l-.326.35L18.082 0l-.574.284l2.25 4.836l-2.108.741h-.05l-1.143-1.359l-1.144 1.36H8.687l-1.144-1.36l-1.146 1.363H6.36L4.24 5.12L6.491.284L5.919 0l-2.53 2.668l-.327-.349l.705-1.798l-.512-.236l-.89 1.287L1.253.382L.69.804L2.42 3.69l-.89.939l.311 2.375l2.061.787L3.9 8.817H1.947v.444l.755 1.078l1.197.433v6.971l3.057 4.55L7.657 24l1.101-1.606L9.9 24l.999-1.606L12 24l1.102-1.606L14.1 24l1.141-1.606L16.343 24l.701-1.706l3.058-4.55v-6.972l1.196-.433l.756-1.078v-.444h-1.952l.003-1.03l2.054-.784l.311-2.375l-.89-.939zm-8.93 18.718H8.033l.793-1.615l.794 1.615l.793-1.083l.793 1.083l.794-1.083l.793 1.083l.794-1.083zl.793-1.615l.794 1.615zm3.886-7.39l-3.3 1.084l-.143 3.061l-2.827.627l-2.826-.627l-.142-3.06l-3.3-1.085v-1.635l4.266 1.21l-.052 4.126h4.109l-.052-4.127l4.266-1.209z" },
  prisma: { label: "Prisma", icon: "M21.807 18.285L13.553.757a1.32 1.32 0 0 0-1.129-.755a1.31 1.31 0 0 0-1.206.626l-8.952 14.5a1.36 1.36 0 0 0 .016 1.455l4.376 6.778a1.41 1.41 0 0 0 1.58.581l12.703-3.757c.389-.115.707-.39.873-.755s.164-.783-.007-1.145m-1.848.752L9.18 22.224a.452.452 0 0 1-.575-.52l3.85-18.438c.072-.345.549-.4.699-.08l7.129 15.138a.515.515 0 0 1-.325.713" }
};

const byAlias = new Map<string, string>();
for(const [id, { aliases = [] }] of Object.entries(known)) {
  byAlias.set(id, id);
  for(const alias of aliases) byAlias.set(alias, id);
}

/** The provider of a resource type, or undefined when the type has no provider prefix. */
export function providerOf(type: string): ProviderInfo | undefined {
  const [prefix, ...rest] = type.split(".");
  if(!prefix || rest.length === 0) return undefined;
  const id = byAlias.get(prefix.toLowerCase());
  if(id) return { id, label: known[id]!.label, icon: known[id]!.icon };
  return { id: "custom", label: prefix };
}

export function providerColor(provider: ProviderInfo) {
  return `var(--av-prov-${provider.id})`;
}

export function ProviderMark({ provider, size = 12, className }: { provider: ProviderInfo, size?: number, className?: string }) {
  const style: CSSProperties = { width: size, height: size, color: providerColor(provider) };
  return provider.icon
    ? <svg aria-hidden viewBox="0 0 24 24" style={style} className={className}><path d={provider.icon} fill="currentColor" /></svg>
    : <svg aria-hidden viewBox="0 0 24 24" style={style} className={className}><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" strokeWidth="2.5" /></svg>;
}

// One tooltip for every resource on the page: it trails the pointer, so two
// are never open at once and moving to the next resource just changes its text.
const tooltip = createTooltipController<ProviderInfo>();

// Opening it by hand (to move it with the pointer) detaches it from hover, so
// it is closed by hand too: shortly after the pointer leaves a resource, unless
// it has already moved onto the next one.
let closeTimer: ReturnType<typeof setTimeout> | undefined;

// Where the pointer last was over a resource. The tooltip is anchored to it.
const pointer = { x: 0, y: 0 };
const pointerAnchor = { getBoundingClientRect: () => new DOMRect(pointer.x, pointer.y, 0, 0) };

/** Mount once, near the root. */
export function ProviderTooltip() {
  return (
    <Tooltip controller={tooltip} delay={350}>
      <TooltipContent<ProviderInfo>
        anchor={pointerAnchor}
        side="bottom"
        align="start"
        sideOffset={14}
        alignOffset={10}
        className="pointer-events-none z-50 flex items-center overflow-hidden rounded-md border border-line bg-surface px-2 py-1 text-xs font-medium shadow-popup origin-(--transform-origin) transition-[opacity,scale,left,top] [transition-duration:150ms,150ms,90ms,90ms] ease-(--ease-out) data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:opacity-0 data-instant:[transition-property:left,top] motion-reduce:[transition-property:opacity]"
      >
        {state => state.payload && <TipSession open={state.open} provider={state.payload} />}
      </TooltipContent>
    </Tooltip>
  );
}

const BLUR = "blur(6px)";

/**
 * Starts the label afresh each time the tooltip opens, so a new opening is
 * sized to its own resource rather than easing from the last one it showed.
 * Swaps while it stays open still animate.
 */
function TipSession({ open, provider }: { open: boolean, provider: ProviderInfo }) {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if(open !== wasOpen) {
    setWasOpen(open);
    if(open) setSession(n => n + 1);
  }
  return <TipBody key={session} provider={provider} />;
}

/**
 * The tooltip's label. Changing `id` cross-fades the old label out and the new
 * one in, both through a slight blur, while the width eases to fit the new one
 * instead of jumping. Shared by every tooltip that swaps its label in place.
 */
export function TipMorph({ id, children }: { id: string, children: ReactNode }) {
  const reduce = useReducedMotion();
  const sizer = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number>();
  useLayoutEffect(() => setWidth(sizer.current?.offsetWidth), [id]);

  // w-max: while the box eases narrower, the label keeps its own width (and
  // its mark its size) and is clipped, instead of being squeezed to fit.
  const row = "flex w-max items-center gap-1.5 whitespace-nowrap";
  return (
    <motion.div className="relative" initial={false} animate={{ width }} transition={{ duration: reduce ? 0 : 0.24, ease: easeOut }}>
      {/* Measures the new label at its natural width; the visible ones may be mid-fade. */}
      <span ref={sizer} aria-hidden className={`invisible absolute top-0 left-0 ${row}`}>{children}</span>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={id}
          className={row}
          initial={{ opacity: 0, filter: reduce ? "blur(0px)" : BLUR }}
          animate={{ opacity: 1, filter: "blur(0px)", transition: { opacity: { duration: 0.2, ease: easeOut }, filter: { duration: 0.32, ease: easeOut } } }}
          // Leaving is quicker: it's getting out of the way.
          exit={{ opacity: 0, filter: reduce ? "blur(0px)" : BLUR, transition: { duration: 0.18, ease: easeOut } }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  );
}

/** The graph's tooltip label: the provider's mark and name. */
function TipBody({ provider }: { provider: ProviderInfo }) {
  return (
    <TipMorph id={`${provider.id}:${provider.label}`}>
      <ProviderMark provider={provider} size={12} className="shrink-0" />
      {provider.label}
    </TipMorph>
  );
}

/**
 * Hovering what it wraps names the provider in the shared tooltip. Pass the
 * element to render (a link, a div) as `render`; it keeps its own props.
 */
export function ProviderTip({ type, render, children }: { type: string, render: ReactElement<any>, children?: ReactNode }) {
  const provider = providerOf(type);
  if(!provider) return cloneElement(render, undefined, children);
  return (
    <TooltipTrigger
      controller={tooltip}
      payload={provider}
      render={render}
      onPointerEnter={() => clearTimeout(closeTimer)}
      onPointerLeave={() => {
        clearTimeout(closeTimer);
        closeTimer = setTimeout(() => tooltip.close(), 60);
      }}
      onPointerMove={event => {
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        // The tooltip only re-reads its anchor when asked, so ask on every move.
        if(tooltip.isOpen()) void tooltip.open({ payload: provider, anchor: pointerAnchor });
      }}
    >
      {children}
    </TooltipTrigger>
  );
}
