"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, ShieldCheck } from "lucide-react";
import AccessNotice from "@/app/components/AccessNotice";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import AppCard from "@/app/components/ui/AppCard";
import SectionCard from "@/app/components/ui/SectionCard";
import StatusBadge from "@/app/components/ui/StatusBadge";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { commissionsFetch } from "@/app/lib/commissions/commissions-api.client";

type DirectionSalesBookObjective = {
  id: string;
  title: string;
  status: string;
  entries_count: number;
  entries_pending_validation: number;
};

type DirectionSalesBook = {
  chauffeur_id: number;
  chauffeur_label: string;
  objectives: DirectionSalesBookObjective[];
};

export default function DirectionCommissionsPage() {
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();
  const canUseCommissions = hasPermission("commissions");

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [books, setBooks] = useState<DirectionSalesBook[]>([]);

  const loadBooks = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    const response = await commissionsFetch("/api/direction/sales-books");
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      books?: DirectionSalesBook[];
    };

    if (!response.ok) {
      setBooks([]);
      setErrorMessage(payload.error ?? "Impossible de charger les livres autorises.");
      setLoading(false);
      return;
    }

    setBooks(Array.isArray(payload.books) ? payload.books : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (accessLoading || !user || !canUseCommissions) return;
    void loadBooks();
  }, [accessLoading, canUseCommissions, loadBooks, user]);

  const summary = useMemo(() => {
    return books.reduce(
      (acc, book) => {
        acc.books += 1;
        acc.objectives += book.objectives.length;
        acc.pending += book.objectives.reduce(
          (sum, item) => sum + item.entries_pending_validation,
          0
        );
        return acc;
      },
      { books: 0, objectives: 0, pending: 0 }
    );
  }, [books]);

  if (accessLoading || (!errorMessage && !canUseCommissions && !!user) || (canUseCommissions && loading)) {
    return <TagoraLoadingScreen isLoading message="Chargement des livres autorises..." fullScreen />;
  }

  if (!user) {
    return (
      <div className="page-container">
        <AccessNotice title="Session requise" description="Connectez-vous pour continuer." />
      </div>
    );
  }

  if (!canUseCommissions) {
    return (
      <div className="page-container">
        <AccessNotice
          title="Acces refuse"
          description="La permission commissions est requise pour consulter les livres autorises."
        />
      </div>
    );
  }

  return (
    <main className="page-container direction-sales-books-page">
      <AuthenticatedPageHeader
        title="Livres autorises"
        subtitle="Consultation operationnelle des livres de ventes accordes par l administration, sans montants monetaires."
      />

      {errorMessage ? (
        <div style={{ marginTop: 20 }}>
          <AccessNotice title="Chargement limite" description={errorMessage} />
        </div>
      ) : null}

      <SectionCard
        title="Vue d ensemble"
        subtitle="Acces limite aux employes explicitement autorises par un administrateur."
        className="ui-stack-sm"
      >
        <div className="direction-sales-books-kpi-grid">
          <AppCard tone="muted" className="direction-sales-books-kpi">
            <span className="tagora-label">Livres autorises</span>
            <strong>{summary.books}</strong>
          </AppCard>
          <AppCard tone="muted" className="direction-sales-books-kpi">
            <span className="tagora-label">Objectifs visibles</span>
            <strong>{summary.objectives}</strong>
          </AppCard>
          <AppCard tone="muted" className="direction-sales-books-kpi">
            <span className="tagora-label">Entrees a valider</span>
            <strong>{summary.pending}</strong>
          </AppCard>
        </div>
      </SectionCard>

      {books.length === 0 ? (
        <SectionCard title="Aucun livre autorise" className="ui-stack-sm">
          <AccessNotice
            title="Aucun livre autorise"
            description="Aucun livre autorise — demandez l'acces a un administrateur."
          />
        </SectionCard>
      ) : (
        <SectionCard
          title="Livres autorises"
          subtitle="Chaque carte represente un employe dont le livre vous a ete ouvert par l administration."
          className="ui-stack-sm"
        >
          <div className="direction-sales-books-grid">
            {books.map((book) => (
              <AppCard key={book.chauffeur_id} tone="elevated" className="direction-sales-book-card">
                <div className="direction-sales-book-card-head">
                  <div className="direction-sales-book-icon" aria-hidden>
                    <BookOpenCheck size={22} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>{book.chauffeur_label}</div>
                    <div className="tagora-note" style={{ marginTop: 4 }}>
                      Employe #{book.chauffeur_id}
                    </div>
                  </div>
                </div>

                <div className="direction-sales-book-badges">
                  <StatusBadge label="Acces accorde par Admin" tone="info" />
                  <StatusBadge
                    label={`${book.objectives.length} objectif${book.objectives.length > 1 ? "s" : ""}`}
                    tone="default"
                  />
                </div>

                <p className="tagora-note direction-sales-book-note">
                  Vue operationnelle uniquement : volumes, statuts et workflow. Aucun montant monetaire
                  affiche.
                </p>

                <Link
                  href={`/direction/commissions/livres/${book.chauffeur_id}`}
                  className="tagora-dark-action direction-sales-book-action"
                >
                  Consulter
                </Link>
              </AppCard>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Confidentialite" className="ui-stack-sm">
        <div className="tagora-panel-muted direction-sales-books-security">
          <ShieldCheck size={18} aria-hidden />
          <p>
            Les montants de commission, salaires, taux horaires, bonus et couts de paie restent reserves
            a l administration. Vous ne voyez que les livres explicitement autorises.
          </p>
        </div>
      </SectionCard>

      <style jsx>{`
        .direction-sales-books-kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
        }
        .direction-sales-books-kpi {
          display: grid;
          gap: 8px;
          padding: 14px;
        }
        .direction-sales-books-kpi strong {
          font-size: 1.45rem;
          line-height: 1.1;
        }
        .direction-sales-books-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
        }
        .direction-sales-book-card {
          display: grid;
          gap: 14px;
          padding: 18px;
        }
        .direction-sales-book-card-head {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }
        .direction-sales-book-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: linear-gradient(135deg, #eff6ff, #dbeafe);
          color: #1d4ed8;
        }
        .direction-sales-book-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .direction-sales-book-note {
          margin: 0;
          line-height: 1.45;
        }
        .direction-sales-book-action {
          justify-self: start;
          text-decoration: none;
        }
        .direction-sales-books-security {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          padding: 14px;
        }
        .direction-sales-books-security p {
          margin: 0;
          line-height: 1.5;
        }
      `}</style>
    </main>
  );
}
