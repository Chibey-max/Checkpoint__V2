/**
 * The pure parts of David's Guard and agents, imported by path so the in-browser mock runs the same code as
 * the services: the deterministic parser, the offer and basket rules, the Coordinator and the template
 * explanations. None of these files touch Node APIs. The packages only export their server entry points,
 * which do, so this file reaches past them on purpose.
 */
export { parseDeterministic } from "../../../../../packages/agents/src/parser/deterministic";
export { planBasket } from "../../../../../packages/agents/src/coordinator";
export { templateBasket, templateVerdict } from "../../../../../packages/agents/src/explain";
export { assessBasket, assessOffers } from "../../../../../packages/guard/src/rules";
