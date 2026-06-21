import { jsx as e, jsxs as r, Fragment as m } from "react/jsx-runtime";
import u from "react";
function h({
  variant: n = "primary",
  children: i,
  href: a,
  onClick: c,
  arrow: s = !1,
  disabled: d = !1,
  className: t = ""
}) {
  const l = `md-btn md-btn--${n}${d ? " md-btn--disabled" : ""} ${t}`.trim(), o = /* @__PURE__ */ r(m, { children: [
    i,
    s && /* @__PURE__ */ e("svg", { className: "md-btn__arrow", viewBox: "0 0 14 14", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: /* @__PURE__ */ e("path", { d: "M2 7h10M8 3l4 4-4 4" }) })
  ] });
  return a ? /* @__PURE__ */ e("a", { href: a, className: l, children: o }) : /* @__PURE__ */ e("button", { className: l, onClick: c, disabled: d, children: o });
}
function _({ segments: n, className: i = "" }) {
  return /* @__PURE__ */ r("div", { className: `md-kicker ${i}`.trim(), "aria-label": "Kategorie", children: [
    /* @__PURE__ */ e("span", { className: "md-kicker__bar", "aria-hidden": "true" }),
    n.map((a, c) => /* @__PURE__ */ r(u.Fragment, { children: [
      c > 0 && /* @__PURE__ */ e("span", { className: "md-kicker__dot", "aria-hidden": "true" }),
      /* @__PURE__ */ e("span", { className: "md-kicker__text", children: a })
    ] }, a))
  ] });
}
function v({
  title: n = "Menschen, Prozesse und Technik —",
  titleEmphasis: i = "der Mensch und Technologie wieder verbindet.",
  subtitle: a = "Mit 30+ Jahren Führungserfahrung begleite ich Menschen und Organisationen bei der digitalen Transformation — praxisnah, empathisch und auf Augenhöhe.",
  kickerSegments: c = ["Digital Coach", "Führungskräfte-Mentor"],
  ctaLabel: s = "Kostenloses Erstgespräch",
  ctaHref: d = "/kontakt",
  secondaryLabel: t = "Angebote ansehen",
  secondaryHref: l = "#angebote",
  avatarInitials: o = "BM"
}) {
  return /* @__PURE__ */ r("section", { className: "md-hero", "aria-label": "Hero-Bereich", children: [
    /* @__PURE__ */ e("div", { className: "md-hero__halo", "aria-hidden": "true" }),
    /* @__PURE__ */ e("div", { className: "md-hero__wrap", children: /* @__PURE__ */ r("div", { className: "md-hero__grid", children: [
      /* @__PURE__ */ r("div", { className: "md-hero__copy", children: [
        /* @__PURE__ */ e(_, { segments: c }),
        /* @__PURE__ */ r("h1", { className: "md-hero__h1", children: [
          n,
          i && /* @__PURE__ */ r(m, { children: [
            " ",
            /* @__PURE__ */ e("em", { children: i })
          ] })
        ] }),
        /* @__PURE__ */ e("p", { className: "md-hero__lede", children: a }),
        /* @__PURE__ */ r("div", { className: "md-hero__cta", role: "group", "aria-label": "Aktionen", children: [
          /* @__PURE__ */ e(h, { href: d, variant: "primary", arrow: !0, children: s }),
          /* @__PURE__ */ e(h, { href: l, variant: "ghost", children: t })
        ] })
      ] }),
      /* @__PURE__ */ e("div", { className: "md-hero__portrait-wrap", "aria-hidden": "true", children: /* @__PURE__ */ e("div", { className: "md-hero__portrait", children: /* @__PURE__ */ e("span", { className: "md-hero__initials", children: o }) }) })
    ] }) })
  ] });
}
function f({
  num: n,
  title: i,
  meta: a,
  description: c,
  features: s,
  price: d,
  href: t = "#"
}) {
  return /* @__PURE__ */ r("article", { className: "md-service-card", children: [
    /* @__PURE__ */ r("header", { className: "md-service-card__header", children: [
      /* @__PURE__ */ e("span", { className: "md-service-card__num", "aria-hidden": "true", children: n }),
      /* @__PURE__ */ r("div", { children: [
        /* @__PURE__ */ e("h3", { className: "md-service-card__title", children: i }),
        a && /* @__PURE__ */ e("p", { className: "md-service-card__meta", children: a })
      ] })
    ] }),
    /* @__PURE__ */ e("p", { className: "md-service-card__desc", children: c }),
    /* @__PURE__ */ e("ul", { className: "md-service-card__features", "aria-label": "Leistungen", children: s.map((l) => /* @__PURE__ */ e("li", { className: "md-service-card__feature", children: l }, l)) }),
    /* @__PURE__ */ r("footer", { className: "md-service-card__footer", children: [
      /* @__PURE__ */ e("span", { className: "md-service-card__price", children: d }),
      /* @__PURE__ */ r("a", { href: t, className: "md-service-card__cta", children: [
        "Mehr erfahren",
        /* @__PURE__ */ e("svg", { viewBox: "0 0 14 14", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: /* @__PURE__ */ e("path", { d: "M2 7h10M8 3l4 4-4 4" }) })
      ] })
    ] })
  ] });
}
function k({ quote: n, name: i, role: a }) {
  return /* @__PURE__ */ r("blockquote", { className: "md-quote-card", children: [
    /* @__PURE__ */ r("p", { className: "md-quote-card__text", children: [
      "„",
      n,
      '"'
    ] }),
    /* @__PURE__ */ r("footer", { className: "md-quote-card__footer", children: [
      /* @__PURE__ */ e("cite", { className: "md-quote-card__name", children: i }),
      a && /* @__PURE__ */ e("span", { className: "md-quote-card__role", children: a })
    ] })
  ] });
}
function g({
  kicker: n,
  headline: i,
  emphasis: a,
  subtext: c,
  align: s = "left",
  id: d
}) {
  return /* @__PURE__ */ r("div", { className: `md-section-title md-section-title--${s}`, id: d, children: [
    n && n.length > 0 && /* @__PURE__ */ e(_, { segments: n }),
    /* @__PURE__ */ r("h2", { className: "md-section-title__h2", children: [
      i,
      a && /* @__PURE__ */ r(m, { children: [
        " ",
        /* @__PURE__ */ e("em", { children: a })
      ] })
    ] }),
    c && /* @__PURE__ */ e("p", { className: "md-section-title__sub", children: c })
  ] });
}
function b({ stats: n }) {
  return /* @__PURE__ */ e("div", { className: "md-stat-block", role: "list", "aria-label": "Kennzahlen", children: n.map(({ value: i, label: a }) => /* @__PURE__ */ r("div", { className: "md-stat-block__item", role: "listitem", children: [
    /* @__PURE__ */ e("span", { className: "md-stat-block__value", children: i }),
    /* @__PURE__ */ e("span", { className: "md-stat-block__label", children: a })
  ] }, a)) });
}
export {
  h as Button,
  v as Hero,
  _ as KickerBar,
  k as QuoteCard,
  g as SectionTitle,
  f as ServiceCard,
  b as StatBlock
};
