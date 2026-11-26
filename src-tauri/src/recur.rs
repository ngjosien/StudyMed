//! Recurrence helpers for bills (weekly/monthly/yearly) and birthdays (yearly).

use chrono::{Datelike, Duration, Months, NaiveDate};

pub fn parse_date(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s.get(..10)?, "%Y-%m-%d").ok()
}

/// Occurrences of a repeating date within [from, to] (inclusive).
pub fn occurrences(anchor: NaiveDate, freq: &str, every_n: i64, from: NaiveDate, to: NaiveDate) -> Vec<NaiveDate> {
    let n = every_n.max(1) as u32;
    let mut out = Vec::new();
    let mut k: u32 = 0;
    // Fast-forward roughly to `from` to keep loops short.
    if from > anchor {
        let days = (from - anchor).num_days().max(0) as u32;
        k = match freq {
            "weekly" => days / (7 * n),
            "monthly" => (days / 31) / n,
            _ => (days / 366) / n,
        }
        .saturating_sub(1);
    }
    loop {
        let d = match freq {
            "weekly" => anchor + Duration::weeks((k * n) as i64),
            "monthly" => match anchor.checked_add_months(Months::new(k * n)) {
                Some(d) => d,
                None => break,
            },
            _ => match anchor.checked_add_months(Months::new(12 * k * n)) {
                Some(d) => d,
                None => break,
            },
        };
        if d > to {
            break;
        }
        if d >= from {
            out.push(d);
        }
        k += 1;
        if k > 100_000 {
            break;
        }
    }
    out
}

/// Birthday stored as 'YYYY-MM-DD' or '--MM-DD'. Returns (month, day, birth_year).
pub fn parse_birthday(s: &str) -> Option<(u32, u32, Option<i32>)> {
    if let Some(rest) = s.strip_prefix("--") {
        let (m, d) = rest.split_once('-')?;
        return Some((m.parse().ok()?, d.parse().ok()?, None));
    }
    let d = parse_date(s)?;
    Some((d.month(), d.day(), Some(d.year())))
}

/// Birthday dates within [from, to]. Feb 29 falls on Feb 28 in non-leap years.
pub fn birthday_occurrences(month: u32, day: u32, from: NaiveDate, to: NaiveDate) -> Vec<NaiveDate> {
    let mut out = Vec::new();
    for y in from.year()..=to.year() {
        let d = NaiveDate::from_ymd_opt(y, month, day)
            .or_else(|| NaiveDate::from_ymd_opt(y, month, day.saturating_sub(1)));
        if let Some(d) = d {
            if d >= from && d <= to {
                out.push(d);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(s: &str) -> NaiveDate {
        parse_date(s).unwrap()
    }

    #[test]
    fn monthly_clamps_to_month_end() {
        let v = occurrences(d("2026-01-31"), "monthly", 1, d("2026-02-01"), d("2026-04-30"));
        assert_eq!(v, vec![d("2026-02-28"), d("2026-03-31"), d("2026-04-30")]);
    }

    #[test]
    fn weekly_and_fast_forward() {
        let v = occurrences(d("2020-01-06"), "weekly", 2, d("2026-11-01"), d("2026-11-30"));
        assert!(!v.is_empty());
        assert!(v.iter().all(|x| (*x - d("2020-01-06")).num_days() % 14 == 0));
    }

    #[test]
    fn birthdays() {
        assert_eq!(parse_birthday("--03-14"), Some((3, 14, None)));
        assert_eq!(parse_birthday("2004-02-29"), Some((2, 29, Some(2004))));
        assert_eq!(birthday_occurrences(2, 29, d("2027-01-01"), d("2027-12-31")), vec![d("2027-02-28")]);
    }
}
