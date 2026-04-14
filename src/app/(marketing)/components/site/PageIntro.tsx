import type { ReactNode } from "react";

type PageIntroProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
};

export default function PageIntro({
  eyebrow,
  title,
  description,
  actions,
}: PageIntroProps) {
  return (
    <section className="px-6 pb-10 pt-10 lg:px-8 lg:pb-14 lg:pt-16">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-[2.6rem] border border-white/10 bg-[linear-gradient(135deg,#071629_0%,#0d2242_54%,#16345f_100%)] px-6 py-10 shadow-[0_36px_120px_rgba(4,15,30,0.3)] sm:px-8 lg:px-12 lg:py-14">
          <div className="max-w-3xl">
            <div className="inline-flex rounded-full border border-white/12 bg-white/8 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/78">
              {eyebrow}
            </div>
            <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl lg:text-[4.25rem] lg:leading-[0.98]">
              {title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200/90">
              {description}
            </p>
            {actions ? <div className="mt-8 flex flex-wrap gap-4">{actions}</div> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
