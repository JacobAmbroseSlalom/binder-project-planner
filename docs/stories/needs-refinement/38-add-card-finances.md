# 38. Add card finances

**Status:** Not started

#### Acceptance criteria

- A technical spike determines whether a suitable card-pricing API is available and can provide prices for the cards supported by the app.
- The spike documents the evaluated API, card-matching approach, price data available, usage limits, and any cards for which prices cannot be retrieved.
- Automated card pricing is implemented only if the spike confirms that a suitable API integration is possible.
- If the spike does not identify a suitable pricing API, card finances remain available in a manual-only pricing mode.
- Manual-only pricing continues to support checklist prices, financial totals, and manual price updates without displaying automated price-refresh controls.
- When a card is loaded, its latest available price is fetched from the pricing API.
- The fetched price and the time it was retrieved are saved with the card through the backend.
- The Card Checklist displays the saved price for each card.
- The Card Checklist displays totals at the top for all cards, unacquired cards, and cards matching the active checklist search and filters.
- Changing a card's acquisition state or the active checklist filters updates the applicable totals.
- The "View Financials" tab displays the totals for all cards, unacquired cards, and filtered cards.
- The Card Checklist has a button that fetches updated prices for its cards from the pricing API.
- Price refresh uses the shared loading component until all requested prices have either loaded or failed.
- After price fetching completes, an overview displays an old price, new price, and change amount for each card.
- The old-price column displays the card's currently saved price.
- The new-price column displays the price returned by the pricing API.
- The change column displays the difference between the old and new prices when both prices are available.
- If a price cannot be fetched for a card, its new price and change amount are blank while its old price remains visible.
- A request-level price refresh failure removes the loading state and displays the provided error using the shared failed toast.
- Fetched prices are not persisted until the price overview is available for review.
- TBD: During implementation, determine whether reviewed prices are persisted with an explicit save action or automatically after the overview is displayed.
- A card's price can be entered or edited manually.
- A manually entered price is saved with the card through the backend and is identified as a manual price.
- Manual prices are visually distinct from API-fetched prices on the Card Checklist and the "View Financials" tab.
- Automatically refreshing prices does not overwrite manually entered prices.
- Fetched and manually entered price changes use the shared save-status toast and restore the previous saved price if saving fails.

#### Technical requirements

- TBD: Define the pricing-provider spike, price data model, manual-pricing contract, refresh workflow, and financial-aggregation behavior.
