"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, BookOpenCheck, ClipboardList, Mail, ShieldCheck, Target } from "lucide-react";
import AccessNotice from "@/app/components/AccessNotice";
import AuthenticatedPageHeader from "@/app/components/ui/AuthenticatedPageHeader";
import AppCard from "@/app/components/ui/AppCard";
import SectionCard from "@/app/components/ui/SectionCard";
import StatusBadge from "@/app/components/ui/StatusBadge";
import TagoraLoadingScreen from "@/app/components/ui/TagoraLoadingScreen";
import { useCurrentAccess } from "@/app/hooks/useCurrentAccess";
import { hasAdminFinanceAccess } from "@/app/lib/auth/admin-finance";
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
  chauffeur_nom: string | null;
  chauffeur_courriel: string | null;
  objectives: DirectionSalesBookObjective[];
};

function bookDisplayName(book: DirectionSalesBook) {
  if (book.chauffeur_nom?.trim()) return book.chauffeur_nom.trim();
  return book.chauffeur_label;
}

export default function DirectionCommissionsPage() {
  const { user, loading: accessLoading, hasPermission } = useCurrentAccess();
  const canUseCommissions = hasPermission("commissions");
  const isAdminViewer = hasAdminFinanceAccess(user);

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
      setErrorMessage(payload.error ?? "Impossible de charger les livres autorisés.");
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
    return (
      <TagoraLoadingScreen isLoading message="Chargement des livres de ventes autorisés..." fullScreen />
    );
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
          title="Accès refusé"
          description="La permission commissions est requise pour consulter les livres autorisés."
        />
      </div>
    );
  }

  const showEmptyState = !errorMessage && books.length === 0;

  return (
    <main className="page-container direction-sales-books-page">
      <AuthenticatedPageHeader
        title="Livres de ventes autorisés"
        subtitle="Consultez les livres de ventes qui vous sont partagés."
      />

      {errorMessage ? (
        <div className="direction-sales-books-alert">
          <AccessNotice title="Chargement impossible" description={errorMessage} />
          <button type="button" className="tagora-dark-outline-action" onClick={() => void loadBooks()}>
            Réessayer
          </button>
        </div>
      ) : null}

      {!errorMessage ? (
        <SectionCard
          title="Vue d'ensemble"
          subtitle="Indicateurs basés sur les livres qui vous sont ouverts."
          className="ui-stack-sm"
        >
          <div className="direction-sales-books-kpi-grid">
            <AppCard tone="muted" className="direction-sales-books-kpi-card">
              <div className="direction-sales-books-kpi-icon direction-sales-books-kpi-icon-book" aria-hidden>
                <BookOpen size={20} />
              </div>
              <div>
                <div className="direction-sales-books-kpi-value">{summary.books}</div>
                <div className="direction-sales-books-kpi-label">Livres accessibles</div>
              </div>
            </AppCard>
            <AppCard tone="muted" className="direction-sales-books-kpi-card">
              <div className="direction-sales-books-kpi-icon direction-sales-books-kpi-icon-target" aria-hidden>
                <Target size={20} />
              </div>
              <div>
                <div className="direction-sales-books-kpi-value">{summary.objectives}</div>
                <div className="direction-sales-books-kpi-label">Objectifs visibles</div>
              </div>
            </AppCard>
            <AppCard tone="muted" className="direction-sales-books-kpi-card">
              <div className="direction-sales-books-kpi-icon direction-sales-books-kpi-icon-entries" aria-hidden>
                <ClipboardList size={20} />
              </div>
              <div>
                <div className="direction-sales-books-kpi-value">{summary.pending}</div>
                <div className="direction-sales-books-kpi-label">Entrées à valider</div>
              </div>
            </AppCard>
          </div>
        </SectionCard>
      ) : null}

      {showEmptyState ? (
        <SectionCard title="Vos livres autorisés" className="ui-stack-sm">
          <AppCard tone="muted" className="direction-sales-books-empty">
            <BookOpenCheck size={32} strokeWidth={1.75} aria-hidden />
            <p className="direction-sales-books-empty-title">
              Aucun livre ne vous est ouvert pour le moment
            </p>
            <p className="tagora-note direction-sales-books-empty-text">
              Aucun accès actif ne vous a encore été accordé. Si vous pensez qu&apos;il s&apos;agit
              d&apos;une erreur, contactez l&apos;administration.
            </p>
            {isAdminViewer ? (
              <Link
                href="/admin/commissions/acces-direction"
                className="tagora-dark-outline-action direction-sales-books-empty-cta"
              >
                Configurer les accès
              </Link>
            ) : null}
          </AppCard>
        </SectionCard>
      ) : null}

      {books.length > 0 ? (
        <SectionCard
          title="Vos livres autorisés"
          subtitle="Chaque carte représente un employé dont le livre vous a été ouvert."
          className="ui-stack-sm"
        >
          <div className="direction-sales-books-grid">
            {books.map((book) => (
              <AppCard key={book.chauffeur_id} tone="elevated" className="direction-sales-book-card">
                <div className="direction-sales-book-card-head">
                  <div className="direction-sales-book-icon" aria-hidden>
                    <BookOpenCheck size={22} />
                  </div>
                  <div className="direction-sales-book-identity">
                    <div className="direction-sales-book-name">{bookDisplayName(book)}</div>
                    <dl className="direction-sales-book-meta">
                      {book.chauffeur_courriel ? (
                        <div className="direction-sales-book-meta-row">
                          <dt className="direction-sales-book-meta-label">Courriel</dt>
                          <dd className="direction-sales-book-meta-value">
                            <Mail size={14} aria-hidden />
                            <span>{book.chauffeur_courriel}</span>
                          </dd>
                        </div>
                      ) : null}
                      <div className="direction-sales-book-meta-row">
                        <dt className="direction-sales-book-meta-label">Identifiant</dt>
                        <dd className="direction-sales-book-meta-value">#{book.chauffeur_id}</dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <div className="direction-sales-book-badges">
                  <StatusBadge label="Accès accordé" tone="info" />
                  <StatusBadge label="Montants masqués" tone="warning" />
                  {book.objectives.length > 0 ? (
                    <StatusBadge
                      label={`${book.objectives.length} objectif${book.objectives.length > 1 ? "s" : ""}`}
                      tone="default"
                    />
                  ) : null}
                </div>

                <p className="tagora-note direction-sales-book-note">
                  Vue opérationnelle : volumes, statuts et suivi uniquement.
                </p>

                <div className="direction-sales-book-footer">
                  <Link
                    href={`/direction/commissions/livres/${book.chauffeur_id}`}
                    className="tagora-dark-action direction-sales-book-action"
                  >
                    Consulter le livre
                  </Link>
                </div>
              </AppCard>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Confidentialité" className="ui-stack-sm">
        <div className="tagora-panel-muted direction-sales-books-security">
          <ShieldCheck size={18} aria-hidden />
          <div className="direction-sales-books-security-copy">
            <p>
              Les montants, salaires, taux horaires, bonus et coûts de paie restent réservés à
              l&apos;administration. Vous consultez seulement les livres explicitement autorisés.
            </p>
            <div className="direction-sales-books-security-badges">
              <StatusBadge label="Montants masqués" tone="warning" />
              <StatusBadge label="Consultation partagée" tone="info" />
            </div>
          </div>
        </div>
      </SectionCard>

      <style jsx>{`
        .direction-sales-books-alert {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 12px;
          margin-top: 20px;
        }
        .direction-sales-books-kpi-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }
        .direction-sales-books-kpi-card {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 16px;
        }
        .direction-sales-books-kpi-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          border-radius: 12px;
          flex-shrink: 0;
        }
        .direction-sales-books-kpi-icon-book {
          background: linear-gradient(135deg, #eff6ff, #dbeafe);
          color: #1d4ed8;
        }
        .direction-sales-books-kpi-icon-target {
          background: linear-gradient(135deg, #f5f3ff, #ede9fe);
          color: #6d28d9;
        }
        .direction-sales-books-kpi-icon-entries {
          background: linear-gradient(135deg, #fff7ed, #ffedd5);
          color: #c2410c;
        }
        .direction-sales-books-kpi-value {
          font-size: 1.45rem;
          font-weight: 800;
          line-height: 1.1;
          letter-spacing: -0.02em;
        }
        .direction-sales-books-kpi-label {
          font-weight: 700;
          color: #334155;
          margin-top: 4px;
          font-size: 0.92rem;
        }
        .direction-sales-books-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 10px;
          padding: 36px 24px;
          color: #64748b;
        }
        .direction-sales-books-empty-title {
          margin: 0;
          font-weight: 800;
          font-size: 1.05rem;
          color: #334155;
        }
        .direction-sales-books-empty-text {
          margin: 0;
          max-width: 36rem;
          line-height: 1.5;
        }
        .direction-sales-books-empty-cta {
          margin-top: 8px;
          text-decoration: none;
        }
        .direction-sales-books-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 16px;
          align-items: stretch;
        }
        .direction-sales-book-card {
          display: flex;
          flex-direction: column;
          gap: 0;
          padding: 20px;
          height: 100%;
        }
        .direction-sales-book-card-head {
          display: flex;
          gap: 14px;
          align-items: flex-start;
        }
        .direction-sales-book-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: linear-gradient(135deg, #eff6ff, #dbeafe);
          color: #1d4ed8;
          flex-shrink: 0;
        }
        .direction-sales-book-identity {
          min-width: 0;
          flex: 1;
        }
        .direction-sales-book-name {
          font-weight: 800;
          font-size: 1.08rem;
          line-height: 1.25;
          letter-spacing: -0.01em;
        }
        .direction-sales-book-meta {
          margin: 10px 0 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .direction-sales-book-meta-row {
          display: grid;
          grid-template-columns: 5.5rem minmax(0, 1fr);
          gap: 8px;
          align-items: baseline;
        }
        .direction-sales-book-meta-label {
          margin: 0;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          color: #94a3b8;
        }
        .direction-sales-book-meta-value {
          margin: 0;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          font-size: 0.9rem;
          color: #475569;
          line-height: 1.35;
          word-break: break-word;
        }
        .direction-sales-book-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 18px;
          padding-top: 16px;
          border-top: 1px solid #e2e8f0;
        }
        .direction-sales-book-note {
          margin: 14px 0 0;
          line-height: 1.45;
        }
        .direction-sales-book-footer {
          margin-top: auto;
          padding-top: 18px;
        }
        .direction-sales-book-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
        }
        .direction-sales-books-security {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          padding: 14px;
        }
        .direction-sales-books-security-copy {
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-width: 0;
        }
        .direction-sales-books-security-copy p {
          margin: 0;
          line-height: 1.5;
        }
        .direction-sales-books-security-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        @media (max-width: 720px) {
          .direction-sales-books-kpi-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
