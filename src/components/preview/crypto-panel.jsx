import { cn } from "@/lib/utils";

const PRIMARY = { code: "USDT", name: "Tether" };

const CURRENCIES = [
  { code: "BTC", name: "Bitcoin" },
  { code: "LTC", name: "Litecoin" },
  { code: "TRX", name: "TRON" },
  { code: "ETH", name: "Ethereum" },
  { code: "XMR", name: "Monero" },
  { code: "POL", name: "Polygon" },
  { code: "BNB", name: "BNB" },
  { code: "USDC", name: "USD Coin" },
  { code: "SOL", name: "Solana" },
  { code: "DASH", name: "Dash" },
  { code: "DOGE", name: "Dogecoin" },
  { code: "GRAM", name: "Gram" },
  { code: "BCH", name: "Bitcoin Cash" },
  { code: "AVAX", name: "Avalanche" },
  { code: "DAI", name: "Dai" },
];

export function CryptoPanel({ open }) {
  return (
    <div
      inert={!open}
      className={cn(
        "shrink-0 overflow-hidden transition-[width,max-height,opacity] duration-300 ease-out",
        open ? "opacity-100 max-sm:max-h-[40rem] sm:w-[calc(26rem+--spacing(5))]" : "opacity-0 max-sm:max-h-0 sm:w-0",
      )}
    >
      <section className="grid content-start gap-1.5 border-grid max-sm:mt-4 max-sm:border-t max-sm:pt-4 sm:ml-5 sm:w-[26rem] sm:border-l sm:pl-5">
        <p className="text-sm font-semibold">Accepted crypto</p>
        <p className="-mt-1 text-2xs text-ink-4">{CURRENCIES.length + 1} currencies</p>

        <div className="mt-1 flex items-center justify-between gap-3 rounded-lg bg-ink px-3 py-2 text-ground">
          <span className="truncate text-xs text-ground/70">{PRIMARY.name}</span>
          <span className="shrink-0 text-sm font-semibold">{PRIMARY.code}</span>
        </div>

        <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {CURRENCIES.map((coin) => (
            <li key={coin.code} className="flex items-baseline justify-between gap-3 px-1 text-xs">
              <span className="truncate text-ink-2">{coin.name}</span>
              <span className="shrink-0 font-medium text-ink tabular-nums">{coin.code}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
