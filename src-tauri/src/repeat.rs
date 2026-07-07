//! 重复规则（RRULE）解析与下一次出现日期计算。
//!
//! 序列化格式（类 RRULE）：
//!   FREQ=WEEKLY;INTERVAL=2;BYDAY=0,2,4;COUNT=10;UNTIL=2026-12-31T23:59:59
//!
//! 其中 BYDAY 使用数字 0=周日..6=周六，与 chrono 的 `Weekday::num_days_from_sunday()` 一致。

use chrono::{DateTime, Datelike, Local, NaiveDate, TimeZone};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RepeatRule {
    pub freq: String, // "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"
    pub interval: i32,
    pub byweekday: Option<Vec<i32>>, // 0=周日..6=周六
    pub end_date: Option<String>,    // RFC3339 ISO 日期
    pub count: Option<i32>,
}

const VALID_FREQS: &[&str] = &["DAILY", "WEEKLY", "MONTHLY", "YEARLY"];

/// 将 RepeatRule 序列化为 RRULE 格式字符串。
pub fn serialize_rrule(rule: &RepeatRule) -> String {
    let mut parts = vec![
        format!("FREQ={}", rule.freq),
        format!("INTERVAL={}", rule.interval),
    ];
    if let Some(ref days) = rule.byweekday {
        if !days.is_empty() {
            let day_str: Vec<String> = days.iter().map(|d| d.to_string()).collect();
            parts.push(format!("BYDAY={}", day_str.join(",")));
        }
    }
    if let Some(ref end_date) = rule.end_date {
        parts.push(format!("UNTIL={}", end_date));
    }
    if let Some(count) = rule.count {
        if count > 0 {
            parts.push(format!("COUNT={}", count));
        }
    }
    parts.join(";")
}

/// 解析 RRULE 格式字符串为 RepeatRule。
/// 无效输入返回 None。
pub fn parse_rrule(s: &str) -> Option<RepeatRule> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }

    let mut map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for part in s.split(';') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        if let Some(idx) = part.find('=') {
            let key = part[..idx].to_uppercase();
            let val = part[idx + 1..].trim().to_string();
            map.insert(key, val);
        }
    }

    let freq = map.get("FREQ")?.clone();
    if !VALID_FREQS.contains(&freq.as_str()) {
        return None;
    }

    let interval = map
        .get("INTERVAL")
        .and_then(|s| s.parse::<i32>().ok())
        .unwrap_or(1);
    if interval < 1 {
        return None;
    }

    let byweekday = map
        .get("BYDAY")
        .map(|s| {
            s.split(',')
                .filter_map(|d| d.trim().parse::<i32>().ok())
                .filter(|d| *d >= 0 && *d <= 6)
                .collect::<Vec<_>>()
        })
        .filter(|v| !v.is_empty());

    let end_date = map.get("UNTIL").cloned();
    let count = map.get("COUNT").and_then(|s| s.parse::<i32>().ok());

    Some(RepeatRule {
        freq,
        interval,
        byweekday,
        end_date,
        count,
    })
}

/// 返回日期所在周的周日（00:00 的 NaiveDate）。
/// chrono `Weekday::num_days_from_sunday()` 返回 0=周日..6=周六。
fn sunday_of(dt: DateTime<Local>) -> NaiveDate {
    let day = dt.weekday().num_days_from_sunday() as i64;
    dt.date_naive() - chrono::Duration::days(day)
}

/// 根据规则（freq/interval/byweekday）计算从 from 之后的下一个出现日期，
/// 不考虑 endDate / count 限制。
fn compute_next(rule: &RepeatRule, from: DateTime<Local>) -> Option<DateTime<Local>> {
    let interval = rule.interval as i64;

    match rule.freq.as_str() {
        "DAILY" => Some(from + chrono::Duration::days(interval)),

        "WEEKLY" => {
            if let Some(ref days) = rule.byweekday {
                if days.is_empty() {
                    return Some(from + chrono::Duration::weeks(interval));
                }
                let from_sunday = sunday_of(from);
                let limit = 7 * interval + 7;
                for i in 1..=limit {
                    let candidate = from + chrono::Duration::days(i);
                    let cand_day = candidate.weekday().num_days_from_sunday() as i32;
                    if days.contains(&cand_day) {
                        let cand_sunday = sunday_of(candidate);
                        let week_diff = (cand_sunday - from_sunday).num_days() / 7;
                        if week_diff >= 0 && week_diff % interval == 0 {
                            return Some(candidate);
                        }
                    }
                }
                None
            } else {
                Some(from + chrono::Duration::weeks(interval))
            }
        }

        "MONTHLY" => {
            let original_day = from.day();
            let mut year = from.year();
            let mut month = from.month() as i32 + interval as i32;
            while month > 12 {
                month -= 12;
                year += 1;
            }
            // 尝试创建目标日期，若该月无此日则回退到月末
            let target_naive =
                NaiveDate::from_ymd_opt(year, month as u32, original_day).or_else(|| {
                    // 目标月最后一天 = 下月1号 - 1天
                    let next_first = if month == 12 {
                        NaiveDate::from_ymd_opt(year + 1, 1, 1)
                    } else {
                        NaiveDate::from_ymd_opt(year, month as u32 + 1, 1)
                    }?;
                    Some(next_first - chrono::Duration::days(1))
                })?;
            let naive_dt = target_naive.and_time(from.naive_local().time());
            Local.from_local_datetime(&naive_dt).single()
        }

        "YEARLY" => {
            let original_month = from.month();
            let original_day = from.day();
            let target_year = from.year() + interval as i32;
            // 尝试创建目标日期，若无效（如闰年2月29日）则回退到目标月月末
            let target_naive = NaiveDate::from_ymd_opt(target_year, original_month, original_day)
                .or_else(|| {
                let next_first = if original_month == 12 {
                    NaiveDate::from_ymd_opt(target_year + 1, 1, 1)
                } else {
                    NaiveDate::from_ymd_opt(target_year, original_month + 1, 1)
                }?;
                Some(next_first - chrono::Duration::days(1))
            })?;
            let naive_dt = target_naive.and_time(from.naive_local().time());
            Local.from_local_datetime(&naive_dt).single()
        }

        _ => None,
    }
}

/// 根据规则计算从 from 之后的下一个出现日期。
/// 返回 None 表示规则已到期（endDate/count 到达）或无法计算。
pub fn next_occurrence(rule: &RepeatRule, from: DateTime<Local>) -> Option<DateTime<Local>> {
    // count 已耗尽：count<=0 表示不再生成新出现
    if let Some(count) = rule.count {
        if count <= 0 {
            return None;
        }
    }

    let next = compute_next(rule, from)?;

    // endDate 到期检查
    if let Some(ref end_date) = rule.end_date {
        if let Ok(end_dt) = chrono::DateTime::parse_from_rfc3339(end_date) {
            let end_local = end_dt.with_timezone(&Local);
            if next > end_local {
                return None;
            }
        }
    }

    Some(next)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn test_serialize_daily() {
        let rule = RepeatRule {
            freq: "DAILY".to_string(),
            interval: 1,
            byweekday: None,
            end_date: None,
            count: None,
        };
        assert_eq!(serialize_rrule(&rule), "FREQ=DAILY;INTERVAL=1");
    }

    #[test]
    fn test_serialize_weekly_with_byday() {
        let rule = RepeatRule {
            freq: "WEEKLY".to_string(),
            interval: 2,
            byweekday: Some(vec![0, 2, 4]),
            end_date: None,
            count: Some(10),
        };
        let result = serialize_rrule(&rule);
        assert!(result.contains("FREQ=WEEKLY"));
        assert!(result.contains("INTERVAL=2"));
        assert!(result.contains("BYDAY=0,2,4"));
        assert!(result.contains("COUNT=10"));
    }

    #[test]
    fn test_parse_valid_rrule() {
        let rule = parse_rrule("FREQ=DAILY;INTERVAL=2").unwrap();
        assert_eq!(rule.freq, "DAILY");
        assert_eq!(rule.interval, 2);
        assert!(rule.byweekday.is_none());
        assert!(rule.end_date.is_none());
        assert!(rule.count.is_none());
    }

    #[test]
    fn test_parse_empty_string() {
        assert!(parse_rrule("").is_none());
        assert!(parse_rrule("   ").is_none());
    }

    #[test]
    fn test_parse_invalid_freq() {
        assert!(parse_rrule("FREQ=HOURLY;INTERVAL=1").is_none());
        assert!(parse_rrule("FREQ=invalid;INTERVAL=1").is_none());
    }

    #[test]
    fn test_parse_invalid_interval() {
        assert!(parse_rrule("FREQ=DAILY;INTERVAL=0").is_none());
        assert!(parse_rrule("FREQ=DAILY;INTERVAL=-1").is_none());
    }

    #[test]
    fn test_parse_default_interval() {
        let rule = parse_rrule("FREQ=WEEKLY").unwrap();
        assert_eq!(rule.interval, 1);
    }

    #[test]
    fn test_parse_with_until() {
        let rule = parse_rrule("FREQ=DAILY;INTERVAL=1;UNTIL=2026-12-31T23:59:59").unwrap();
        assert_eq!(rule.end_date, Some("2026-12-31T23:59:59".to_string()));
    }

    #[test]
    fn test_parse_byday_filter() {
        // 合法日期 0-6 被保留，非法日期（7、8）被过滤
        let rule = parse_rrule("FREQ=WEEKLY;INTERVAL=1;BYDAY=0,2,7,8").unwrap();
        assert_eq!(rule.byweekday, Some(vec![0, 2]));

        // 全部非法 → 过滤为空 → None
        let rule = parse_rrule("FREQ=WEEKLY;INTERVAL=1;BYDAY=7,8").unwrap();
        assert!(rule.byweekday.is_none());
    }

    #[test]
    fn test_next_occurrence_daily() {
        let rule = RepeatRule {
            freq: "DAILY".to_string(),
            interval: 1,
            byweekday: None,
            end_date: None,
            count: None,
        };
        let from = Local.with_ymd_and_hms(2026, 1, 1, 9, 0, 0).unwrap();
        let next = next_occurrence(&rule, from).unwrap();
        assert_eq!(next, from + chrono::Duration::days(1));
    }

    #[test]
    fn test_next_occurrence_daily_interval_3() {
        let rule = RepeatRule {
            freq: "DAILY".to_string(),
            interval: 3,
            byweekday: None,
            end_date: None,
            count: None,
        };
        let from = Local.with_ymd_and_hms(2026, 1, 1, 9, 0, 0).unwrap();
        let next = next_occurrence(&rule, from).unwrap();
        assert_eq!(next, from + chrono::Duration::days(3));
    }

    #[test]
    fn test_next_occurrence_weekly_no_byday() {
        let rule = RepeatRule {
            freq: "WEEKLY".to_string(),
            interval: 1,
            byweekday: None,
            end_date: None,
            count: None,
        };
        let from = Local.with_ymd_and_hms(2026, 1, 1, 9, 0, 0).unwrap();
        let next = next_occurrence(&rule, from).unwrap();
        assert_eq!(next, from + chrono::Duration::weeks(1));
    }

    #[test]
    fn test_next_occurrence_count_exhausted() {
        let rule = RepeatRule {
            freq: "DAILY".to_string(),
            interval: 1,
            byweekday: None,
            end_date: None,
            count: Some(0),
        };
        let from = Local.with_ymd_and_hms(2026, 1, 1, 9, 0, 0).unwrap();
        assert!(next_occurrence(&rule, from).is_none());

        // 负数 count 同样视为已耗尽
        let rule_neg = RepeatRule {
            freq: "DAILY".to_string(),
            interval: 1,
            byweekday: None,
            end_date: None,
            count: Some(-1),
        };
        assert!(next_occurrence(&rule_neg, from).is_none());
    }

    #[test]
    fn test_next_occurrence_end_date_reached() {
        let rule = RepeatRule {
            freq: "DAILY".to_string(),
            interval: 1,
            byweekday: None,
            end_date: Some("2026-01-01T23:59:59Z".to_string()),
            count: None,
        };
        // from = 2026-01-01 09:00，下一次出现 = 2026-01-02 09:00，已超过 end_date
        let from = Local.with_ymd_and_hms(2026, 1, 1, 9, 0, 0).unwrap();
        assert!(next_occurrence(&rule, from).is_none());
    }

    #[test]
    fn test_next_occurrence_monthly() {
        let rule = RepeatRule {
            freq: "MONTHLY".to_string(),
            interval: 1,
            byweekday: None,
            end_date: None,
            count: None,
        };
        let from = Local.with_ymd_and_hms(2026, 1, 15, 9, 0, 0).unwrap();
        let next = next_occurrence(&rule, from).unwrap();
        assert_eq!(next, Local.with_ymd_and_hms(2026, 2, 15, 9, 0, 0).unwrap());
    }

    #[test]
    fn test_next_occurrence_yearly() {
        let rule = RepeatRule {
            freq: "YEARLY".to_string(),
            interval: 1,
            byweekday: None,
            end_date: None,
            count: None,
        };
        let from = Local.with_ymd_and_hms(2026, 6, 15, 9, 0, 0).unwrap();
        let next = next_occurrence(&rule, from).unwrap();
        assert_eq!(next, Local.with_ymd_and_hms(2027, 6, 15, 9, 0, 0).unwrap());
    }
}
