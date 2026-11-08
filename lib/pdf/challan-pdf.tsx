import path from "node:path";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import QRCode from "qrcode";
import type { ChallanDetail } from "@/server/stock/challan-detail";
import {
  formatDate,
  formatMoney,
  formatQty,
  makeT,
  type Locale,
  type MessageKey,
} from "@/lib/i18n";

const FONT_DIR = path.join(process.cwd(), "assets/fonts");
Font.register({
  family: "Noto",
  fonts: [
    { src: path.join(FONT_DIR, "noto-sans-latin-400-normal.woff"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "noto-sans-latin-700-normal.woff"), fontWeight: 700 },
  ],
});
// Devanagari names and the ₹ sign fall back to this family.
Font.register({
  family: "NotoDeva",
  fonts: [
    { src: path.join(FONT_DIR, "noto-sans-devanagari-devanagari-400-normal.woff"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "noto-sans-devanagari-devanagari-700-normal.woff"), fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

const MAROON = "#721216";
const MUTED = "#6b6b6b";
const LINE = "#d4d4d4";

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: ["Noto", "NotoDeva"], color: "#111" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: MAROON, paddingBottom: 8 },
  org: { fontSize: 13, fontWeight: 700, color: MAROON },
  muted: { color: MUTED },
  title: { fontSize: 11, fontWeight: 700, textAlign: "right" },
  number: { fontSize: 10, fontWeight: 700, textAlign: "right", marginTop: 2 },
  parties: { flexDirection: "row", marginTop: 10, gap: 8 },
  party: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 3, padding: 6 },
  label: { fontSize: 7, color: MUTED, textTransform: "uppercase", marginBottom: 2 },
  bold: { fontWeight: 700 },
  table: { marginTop: 10, borderTopWidth: 1, borderTopColor: LINE },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 4 },
  th: { fontSize: 7, color: MUTED, textTransform: "uppercase" },
  cNo: { width: 18 },
  cItem: { flex: 1, paddingRight: 4 },
  cQty: { width: 48, textAlign: "right" },
  cUnit: { width: 34, paddingLeft: 4 },
  cRate: { width: 56, textAlign: "right" },
  cAmt: { width: 64, textAlign: "right" },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", paddingVertical: 5, gap: 12 },
  note: { marginTop: 8, padding: 6, backgroundColor: "#f6f6f6", borderRadius: 3 },
  footer: { marginTop: "auto", flexDirection: "row", alignItems: "flex-end", gap: 12 },
  sign: { flex: 1, borderTopWidth: 1, borderTopColor: "#999", paddingTop: 3 },
  qr: { width: 74, alignItems: "center" },
  voidStamp: {
    position: "absolute",
    top: 220,
    left: 60,
    fontSize: 72,
    fontWeight: 700,
    color: "#d11",
    opacity: 0.25,
    transform: "rotate(-25deg)",
  },
});

const TITLE: Record<ChallanDetail["kind"], MessageKey> = {
  receipt: "pdf.receipt",
  transfer: "pdf.transfer",
  return: "pdf.return",
  adjustment: "pdf.adjustment",
  issue: "pdf.issue",
};

function ChallanDocument({ d, locale, qr }: { d: ChallanDetail; locale: Locale; qr: string }) {
  const t = makeT(locale);
  const invoice = d.kind === "receipt";

  const parties: { label: string; value: string; sub?: string }[] =
    d.kind === "receipt"
      ? [
          { label: t("rahdari.vendor"), value: d.partyName ?? "—", sub: d.partyRef ? `${t("rahdari.billNo")} ${d.partyRef}` : undefined },
          { label: t("common.to"), value: d.toName ?? "—" },
        ]
      : d.kind === "issue"
        ? [
            { label: t("common.from"), value: d.fromName ?? "—" },
            { label: t("rahdari.recipient"), value: d.partyName ?? "—" },
          ]
        : d.kind === "adjustment"
          ? [{ label: t("common.department"), value: d.fromName ?? "—", sub: d.note ? `${t("rahdari.reason")}: ${d.note}` : undefined }]
          : [
              { label: t("common.from"), value: d.fromName ?? "—" },
              { label: t("common.to"), value: d.toName ?? "—" },
            ];

  return (
    <Document title={d.number} author={d.center.name}>
      <Page size="A5" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.org}>{d.center.name}</Text>
            <Text style={s.muted}>{[d.center.code, d.center.address].filter(Boolean).join(" · ")}</Text>
          </View>
          <View>
            <Text style={s.title}>{t(TITLE[d.kind])}</Text>
            <Text style={s.number}>{d.number}</Text>
            <Text style={[s.muted, { textAlign: "right" }]}>{formatDate(d.issuedAt, locale, true)}</Text>
          </View>
        </View>

        <View style={s.parties}>
          {parties.map((p) => (
            <View key={p.label} style={s.party}>
              <Text style={s.label}>{p.label}</Text>
              <Text style={s.bold}>{p.value}</Text>
              {p.sub ? <Text style={s.muted}>{p.sub}</Text> : null}
            </View>
          ))}
        </View>

        <View style={s.table}>
          <View style={s.row}>
            <Text style={[s.th, s.cNo]}>{t("pdf.sno")}</Text>
            <Text style={[s.th, s.cItem]}>{t("common.item")}</Text>
            <Text style={[s.th, s.cQty]}>{t("common.qty")}</Text>
            <Text style={[s.th, s.cUnit]}>{t("common.unit")}</Text>
            {invoice ? <Text style={[s.th, s.cRate]}>{t("common.rate")}</Text> : null}
            {invoice ? <Text style={[s.th, s.cAmt]}>{t("common.amount")}</Text> : null}
          </View>
          {d.lines.map((l, i) => (
            <View key={l.id} style={s.row} wrap={false}>
              <Text style={s.cNo}>{i + 1}</Text>
              <View style={s.cItem}>
                <Text>{l.itemName}</Text>
                <Text style={s.muted}>{l.itemSku}</Text>
              </View>
              <Text style={s.cQty}>{Number(l.quantity) > 0 && d.kind === "adjustment" ? "+" : ""}{formatQty(l.quantity)}</Text>
              <Text style={s.cUnit}>{l.unit}</Text>
              {invoice ? <Text style={s.cRate}>{formatMoney(l.rate ?? 0)}</Text> : null}
              {invoice ? <Text style={s.cAmt}>{formatMoney(l.amount ?? 0)}</Text> : null}
            </View>
          ))}
          {invoice ? (
            <View style={s.totalRow}>
              <Text style={s.bold}>{t("pdf.amountTotal")}</Text>
              <Text style={[s.bold, { width: 80, textAlign: "right" }]}>{formatMoney(d.totalAmount ?? 0)}</Text>
            </View>
          ) : null}
        </View>

        {d.note && d.kind !== "adjustment" ? (
          <View style={s.note}>
            <Text style={s.label}>{t("common.note")}</Text>
            <Text>{d.note}</Text>
          </View>
        ) : null}
        {d.status === "void" && d.voidReason ? (
          <View style={[s.note, { backgroundColor: "#fdeaea" }]}>
            <Text>{t("rahdari.voided", { reason: d.voidReason })}</Text>
          </View>
        ) : null}

        <View style={s.footer} wrap={false}>
          <View style={s.sign}>
            <Text style={s.label}>{t("pdf.issuedBy")}</Text>
            <Text>{d.issuedByName}</Text>
          </View>
          <View style={s.sign}>
            <Text style={s.label}>{t("pdf.receivedBy")}</Text>
            <Text>
              {d.acknowledgedByName
                ? `${d.acknowledgedByName} · ${formatDate(d.acknowledgedAt!, locale, true)}`
                : " "}
            </Text>
          </View>
          <View style={s.qr}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
            <Image src={qr} style={{ width: 70, height: 70 }} />
            <Text style={[s.muted, { fontSize: 6 }]}>{t("pdf.verify")}</Text>
          </View>
        </View>

        {d.status === "void" ? <Text style={s.voidStamp}>{t("pdf.voidStamp")}</Text> : null}
      </Page>
    </Document>
  );
}

export function pdfFileName(number: string) {
  return `${number.replaceAll("/", "-")}.pdf`;
}

export async function renderChallanPdf(d: ChallanDetail, opts: { locale: Locale; origin: string }) {
  const qr = await QRCode.toDataURL(`${opts.origin}/r/${d.publicToken}`, { margin: 0, width: 280 });
  return renderToBuffer(<ChallanDocument d={d} locale={opts.locale} qr={qr} />);
}
