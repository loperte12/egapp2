/**
 * FareQuoteCard — tarifa en vivo desde la API de movilidad.
 * Muestra la cotización TAXI (banda de negociación) para la distancia dada.
 * Tinte naranja secundario (servicios). Falla en silencio si la API no
 * responde (la Home sigue funcionando offline con los datos estáticos).
 */

import React, { useEffect, useState } from 'react';
import { espaciado, radios, tipografia, peso, trazo} from '@egrouteplan/ui-kit';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CarTaxiFront, BadgeInfo } from 'lucide-react-native';
import { mobilityApi, fmtXaf, type FareQuote } from '../api/mobility';
import { alpha } from '../constants/colors';
import { useTheme } from '../theme/ThemeContext';

export default function FareQuoteCard({ distanceKm = 3.5, city = 'Malabo' }: { distanceKm?: number; city?: string }) {
  const { colors } = useTheme();
  const [quote, setQuote] = useState<FareQuote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    mobilityApi
      .fareQuote({ serviceType: 'TAXI', zoneType: 'inside', vehicleType: 'car', distanceKm })
      .then((q) => { if (alive) setQuote(q); })
      .catch(() => { /* fallback silencioso: la tarjeta no se muestra */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [distanceKm]);

  if (loading) {
    return (
      <View style={[styles.card, { backgroundColor: alpha(colors.secondary, 0.08), borderColor: alpha(colors.secondary, 0.25) }]}>
        <ActivityIndicator color={colors.text.secondary} size="small" />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Tarifa en vivo…</Text>
      </View>
    );
  }
  if (!quote) return null;
  // Guardarraíl (02/10): httpClient devuelve {} cuando el API responde algo que no
  // es JSON (página de error, proxy caído) y el GET "triunfa". Sin breakdown/band
  // la lectura de baseFare tiraba la app entera al error boundary. El contrato del
  // componente es fallar en silencio: sin datos completos, no se pinta.
  if (!quote.breakdown || !quote.band) return null;

  return (
    <View style={[styles.card, { backgroundColor: alpha(colors.secondary, 0.08), borderColor: alpha(colors.secondary, 0.25) }]}>
      <View style={[styles.iconWrap, { backgroundColor: alpha(colors.secondary, 0.15) }]}>
        <CarTaxiFront size={18} color={colors.text.secondary} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Taxi en {city} · ~{distanceKm} km
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          base {fmtXaf(quote.breakdown.baseFare)} + {fmtXaf(quote.breakdown.perKmRate)}/km · orientativo
        </Text>
      </View>
      <View style={styles.priceBlock}>
        <Text style={[styles.price, { color: colors.text.secondary }]}>{fmtXaf(quote.quote)} XAF</Text>
        <View style={styles.bandRow}>
          <BadgeInfo size={11} color={colors.textSecondary} />
          <Text style={[styles.band, { color: colors.textSecondary }]}>
            negociable {fmtXaf(quote.band.min)}–{fmtXaf(quote.band.max)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: espaciado.e16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: trazo.fino,
    borderRadius: radios.lg,
    padding: espaciado.e12,
    gap: espaciado.e10,
  },
  iconWrap: { width: 38, height: 38, borderRadius: radios.contacto, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  title: { fontSize: tipografia.body, fontWeight: peso.maximo },
  subtitle: { fontSize: tipografia.micro, marginTop: espaciado.e2 },
  priceBlock: { alignItems: 'flex-end' },
  price: { fontSize: tipografia.cuerpo, fontWeight: peso.maximo },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e3, marginTop: espaciado.e2 },
  band: { fontSize: tipografia.minimo, fontWeight: peso.medio },
  loadingText: { fontSize: tipografia.caption, fontWeight: peso.medio, marginLeft: espaciado.e8 },
});
