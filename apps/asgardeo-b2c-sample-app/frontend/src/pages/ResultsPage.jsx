import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SearchPanel } from "../components/SearchPanel";
import {
  createBooking,
  getFlights,
  getHotels,
  getTrips
} from "../api";
import { getCDSProfile, updateCDSProfile } from "../cds-api";
import { formatPrice } from "../utils/bookings";
import { buildFlightDetailsPath } from "../utils/routes";

function extractFavoriteFlightIds(profile) {
  const normalizedProfile = profile?.data || profile?.profile || profile || {};
  const applicationData = normalizedProfile?.application_data || normalizedProfile?.applicationData || {};
  const appScopedFavorites = applicationData?.wayfinder?.flight_no;

  if (Array.isArray(appScopedFavorites)) {
    return appScopedFavorites.map((id) => `${id}`);
  }

  for (const appData of Object.values(applicationData)) {
    if (Array.isArray(appData?.flight_no)) {
      return appData.flight_no.map((id) => `${id}`);
    }
  }

  return [];
}

function BookingButton({ bookingState, children, onClick }) {
  const isBooking = bookingState === "booking";
  const isConfirmed = bookingState === "confirmed";

  return (
    <button
      className={`card-action ${isConfirmed ? "card-action--confirmed" : ""}`}
      type="button"
      disabled={isBooking || isConfirmed}
      onClick={onClick}
    >
      {isBooking ? "Booking..." : isConfirmed ? "Booked" : children}
    </button>
  );
}

function ResultCard({ bookingState, category, isFavorite, item, onBook, onSelectFlight, onToggleFavorite }) {
  if (category === "hotels") {
    return (
      <article className="result-card">
        <div>
          <p className="result-label">Hotel · Rating {item.rating}</p>
          <h2>{item.name}</h2>
          <p>{item.location}</p>
          <div className="result-tags">
            {item.amenities?.map((amenity) => (
              <span key={amenity}>{amenity}</span>
            ))}
          </div>
        </div>
        <div className="result-side">
          <strong>{formatPrice(item.currency, item.nightlyRate)}</strong>
          <span>per night</span>
          <BookingButton bookingState={bookingState} onClick={() => onBook("hotel", item.id)}>
            Reserve
          </BookingButton>
        </div>
      </article>
    );
  }

  if (category === "trips") {
    return (
      <article className="result-card">
        <div>
          <p className="result-label">Trip · {item.status}</p>
          <h2>{item.title}</h2>
          <p>{item.destination}</p>
        </div>
        <div className="result-side">
          <strong>{formatPrice(item.currency, item.totalEstimate)}</strong>
          <span>estimate</span>
          <BookingButton bookingState={bookingState} onClick={() => onBook("trip", item.id)}>
            Book trip
          </BookingButton>
        </div>
      </article>
    );
  }

  return (
    <article className="result-card">
      <div>
        <p className="result-label">
          {item.airline} · {item.stops === 0 ? "Nonstop" : `${item.stops} stop`}
        </p>
        <h2>{item.from} to {item.to}</h2>
        <p>
          {item.departureTime} - {item.arrivalTime} · {item.duration} · {item.dates}
        </p>
        <div className="result-tags">
          {item.tags?.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </div>
      <div className="result-side">
        <button
          className={`favorite-button ${isFavorite ? "favorite-button--active" : ""}`}
          type="button"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          onClick={() => onToggleFavorite(item.id, item)}
        >
          <Heart size={20} />
        </button>
        <strong>{formatPrice(item.currency, item.price)}</strong>
        <span>{item.cabin}</span>
        <BookingButton bookingState={bookingState} onClick={() => onSelectFlight(item.id)}>
          Book flight
        </BookingButton>
      </div>
    </article>
  );
}

export function ResultsPage({ cdsProfileId, criteria, locations, onSearch }) {
  const navigate = useNavigate();
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookingStates, setBookingStates] = useState({});
  const [favorites, setFavorites] = useState(() => new Set());

  useEffect(() => {
    let isCurrent = true;

    async function loadFavoritesFromCDS() {
      if (!cdsProfileId || criteria.category !== "flights") {
        if (isCurrent) {
          setFavorites(new Set());
        }
        return;
      }

      try {
        const profile = await getCDSProfile(cdsProfileId);
        const favoriteIds = extractFavoriteFlightIds(profile);

        if (isCurrent) {
          setFavorites(new Set(favoriteIds.map((id) => `${id}`)));
        }
      } catch (loadError) {
        if (isCurrent) {
          setFavorites(new Set());
        }
        console.warn("Failed to load CDS favorites:", loadError.message);
      }
    }

    loadFavoritesFromCDS();

    return () => {
      isCurrent = false;
    };
  }, [cdsProfileId, criteria.category]);

  useEffect(() => {
    let isCurrent = true;

    async function loadResults() {
      setIsLoading(true);
      setError("");
      setBookingStates({});

      try {
        let data;

        if (criteria.category === "hotels") {
          data = await getHotels({ location: criteria.to });
        } else if (criteria.category === "trips") {
          data = await getTrips({ destination: criteria.to });
        } else {
          data = await getFlights({
            from: criteria.from,
            to: criteria.to
          });
        }

        if (isCurrent) {
          setResults(data);
        }
      } catch (requestError) {
        if (isCurrent) {
          setError(requestError.message);
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    loadResults();

    return () => {
      isCurrent = false;
    };
  }, [criteria]);

  async function handleBooking(type, itemId) {
    setError("");
    setBookingStates((current) => ({
      ...current,
      [itemId]: "booking"
    }));

    try {
      await createBooking({
        type,
        itemId,
        travelers: Number.parseInt(criteria.travelers, 10) || 1
      }, null);

      setBookingStates((current) => ({
        ...current,
        [itemId]: "confirmed"
      }));
    } catch (requestError) {
      setBookingStates((current) => ({
        ...current,
        [itemId]: requestError.message.includes("already exists") ? "confirmed" : "idle"
      }));
      setError(requestError.message);
    }
  }

  async function toggleFavorite(itemId, flight) {
    const newFavorites = new Set(favorites);

    if (newFavorites.has(itemId)) {
      newFavorites.delete(itemId);
    } else {
      newFavorites.add(itemId);
    }

    setFavorites(newFavorites);

    if (cdsProfileId && criteria.category === "flights" && flight) {
      try {
        const favoritedFlights = Array.from(newFavorites)
          .map((id) => {
            const result = results.find((r) => r.id === id);
            return result ? `${result.id}` : null;
          })
          .filter(Boolean);

        await updateCDSProfile(cdsProfileId, {
          application_data: {
            wayfinder: {
              flight_no: favoritedFlights
            }
          }
        });
      } catch (updateError) {
        console.warn("Failed to update CDS profile:", updateError.message);
      }
    }
  }

  function handleFlightSelection(itemId) {
    navigate(buildFlightDetailsPath(itemId, criteria));
  }

  const title =
    criteria.category === "hotels"
      ? `Hotels in ${criteria.to || "your destination"}`
      : criteria.category === "trips"
        ? `Trips to ${criteria.to || "your destination"}`
        : `${criteria.from || "Anywhere"} to ${criteria.to || "anywhere"}`;

  return (
    <main>
      <section className="results-hero">
        <div>
          <p className="eyebrow">Search results</p>
          <h1>{title}</h1>
          <p>
            {criteria.dates || "Flexible dates"} · {criteria.travelers || "Any travelers"}
          </p>
        </div>
        <SearchPanel
          initialCriteria={criteria}
          key={`${criteria.category}-${criteria.from}-${criteria.to}-${criteria.dates}-${criteria.travelers}`}
          locations={locations}
          onSearch={onSearch}
        />
      </section>

      {error && (
        <div className="api-status api-status--error" role="status">
          {error}
        </div>
      )}

      <section className="results-section" aria-label="Search results">
        {isLoading && <p className="empty-state">Loading results...</p>}
        {!isLoading && results.length === 0 && (
          <p className="empty-state">No results matched this search.</p>
        )}
        {!isLoading &&
          results.map((item) => (
            <ResultCard
              category={criteria.category}
              item={item}
              key={item.id}
              bookingState={bookingStates[item.id] || "idle"}
              isFavorite={favorites.has(item.id)}
              onBook={handleBooking}
              onSelectFlight={handleFlightSelection}
              onToggleFavorite={toggleFavorite}
            />
          ))}
      </section>
    </main>
  );
}

