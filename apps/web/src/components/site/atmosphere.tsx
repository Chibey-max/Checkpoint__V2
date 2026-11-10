/**
 * The fixed backdrop behind every page: three slow-drifting glows, the vault door very faintly behind it all
 * (a still of the hero's door), the lathe rings of its face, and film grain.
 */
export function Atmosphere() {
  return (
    <div aria-hidden className="cp-atmos">
      <div className="cp-glow cp-glow-a animate-drift" />
      <div className="cp-glow cp-glow-b animate-drift [animation-delay:-8s]" />
      <div className="cp-glow cp-glow-c animate-drift [animation-delay:-14s]" />
      <div className="cp-door" />
      <div className="cp-grid" />
      <div className="cp-grain" />
    </div>
  );
}
