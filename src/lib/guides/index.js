import { rdpSetup } from "./rdp-setup";

export const GUIDES = [rdpSetup];

export const getGuide = (slug) => GUIDES.find((guide) => guide.slug === slug) ?? null;

export const stepCount = (guide) => guide.phases.reduce((sum, phase) => sum + phase.steps.length, 0);
