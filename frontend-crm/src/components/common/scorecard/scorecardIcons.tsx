import React from 'react';
import type { SvgIconComponent } from '@mui/icons-material';
import AcUnitOutlinedIcon from '@mui/icons-material/AcUnitOutlined';
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined';
import AutorenewOutlinedIcon from '@mui/icons-material/AutorenewOutlined';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import CallOutlinedIcon from '@mui/icons-material/CallOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import CheckCircleOutlineOutlinedIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DiamondOutlinedIcon from '@mui/icons-material/DiamondOutlined';
import DoneAllOutlinedIcon from '@mui/icons-material/DoneAllOutlined';
import DraftsOutlinedIcon from '@mui/icons-material/DraftsOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import ExploreOutlinedIcon from '@mui/icons-material/ExploreOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import HighlightOffOutlinedIcon from '@mui/icons-material/HighlightOffOutlined';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import LocalFireDepartmentOutlinedIcon from '@mui/icons-material/LocalFireDepartmentOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PauseCircleOutlineOutlinedIcon from '@mui/icons-material/PauseCircleOutlineOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import PlayCircleOutlineOutlinedIcon from '@mui/icons-material/PlayCircleOutlineOutlined';
import PriorityHighOutlinedIcon from '@mui/icons-material/PriorityHighOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import SpaOutlinedIcon from '@mui/icons-material/SpaOutlined';
import StarOutlineOutlinedIcon from '@mui/icons-material/StarOutlineOutlined';
import ThermostatOutlinedIcon from '@mui/icons-material/ThermostatOutlined';
import ThumbDownOffAltOutlinedIcon from '@mui/icons-material/ThumbDownOffAltOutlined';
import ThumbUpOffAltOutlinedIcon from '@mui/icons-material/ThumbUpOffAltOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';

interface KeywordRule {
    pattern: RegExp;
    icon: SvgIconComponent;
    /** Short line under the count, in the style of the built-in status cards. */
    hint?: string;
}

/**
 * Option label keyword → icon (+ hint); the first rule whose pattern matches wins. The New / In Process /
 * Converted / Lost rules use the same icons and hints as the built-in Leads status cards.
 */
const KEYWORD_RULES: readonly KeywordRule[] = [
    { pattern: /\b(new|fresh|open)\b/, icon: PersonAddAltOutlinedIcon, hint: 'Not contacted yet' },
    { pattern: /\b(progress|process|processing|working|active|ongoing)\b/, icon: AutorenewOutlinedIcon, hint: 'Being worked on' },
    { pattern: /\b(won|win|converted|success)/, icon: CheckCircleOutlineOutlinedIcon, hint: 'Won' },
    { pattern: /\b(lost|loss|dead)\b/, icon: HighlightOffOutlinedIcon, hint: 'Not going ahead' },
    { pattern: /\b(hot|urgent)\b/, icon: LocalFireDepartmentOutlinedIcon, hint: 'Ready to buy' },
    { pattern: /\b(warm)\b/, icon: ThermostatOutlinedIcon, hint: 'Showing interest' },
    { pattern: /\b(cold)\b/, icon: AcUnitOutlinedIcon, hint: 'Low interest' },
    { pattern: /\b(critical|high)\b/, icon: PriorityHighOutlinedIcon, hint: 'Needs attention first' },
    { pattern: /\b(medium|normal)\b/, icon: FlagOutlinedIcon },
    { pattern: /\b(low)\b/, icon: SpaOutlinedIcon },
    { pattern: /\b(approved|accepted|confirmed|verified|qualified)\b/, icon: VerifiedOutlinedIcon, hint: 'Approved' },
    { pattern: /\b(complete|completed|done|closed|resolved|delivered|paid)\b/, icon: DoneAllOutlinedIcon, hint: 'Completed' },
    { pattern: /\b(rejected|declined|cancel|cancelled|canceled)\b/, icon: CancelOutlinedIcon, hint: 'Declined' },
    { pattern: /\b(unqualified|junk|spam|invalid|blocked)\b/, icon: BlockOutlinedIcon, hint: 'Not a fit' },
    { pattern: /\b(draft)\b/, icon: DraftsOutlinedIcon, hint: 'Not sent yet' },
    { pattern: /\b(sent|submitted|shared)\b/, icon: SendOutlinedIcon, hint: 'Awaiting response' },
    { pattern: /\b(pending|waiting|awaiting)\b/, icon: HourglassEmptyOutlinedIcon, hint: 'Waiting on next step' },
    { pattern: /\b(hold|paused)\b/, icon: PauseCircleOutlineOutlinedIcon, hint: 'Paused for now' },
    { pattern: /\b(contact|contacted|call|called)\b/, icon: CallOutlinedIcon, hint: 'First contact made' },
    { pattern: /\b(meeting|demo|scheduled|follow)/, icon: EventOutlinedIcon, hint: 'Meeting lined up' },
    { pattern: /\b(proposal|quote|quotation)\b/, icon: DescriptionOutlinedIcon, hint: 'Proposal shared' },
    { pattern: /\b(negotiat)/, icon: HandshakeOutlinedIcon, hint: 'Discussing terms' },
    { pattern: /\b(not interested|negative)\b/, icon: ThumbDownOffAltOutlinedIcon, hint: 'Not interested' },
    { pattern: /\b(interested|positive)\b/, icon: ThumbUpOffAltOutlinedIcon, hint: 'Showing interest' },
    { pattern: /\b(started|start|initiated)\b/, icon: PlayCircleOutlineOutlinedIcon },
    { pattern: /\b(escalat|issue|problem|error|overdue)/, icon: WarningAmberOutlinedIcon, hint: 'Needs attention' },
    { pattern: /\b(archived|inactive)\b/, icon: ArchiveOutlinedIcon },
    { pattern: /\b(expired|locked)\b/, icon: LockOutlinedIcon },
];

/** Used in order for options whose label matches no keyword (or whose keyword icon is already taken). */
const FALLBACK_ICONS: readonly SvgIconComponent[] = [
    InsightsOutlinedIcon,
    StarOutlineOutlinedIcon,
    BoltOutlinedIcon,
    DiamondOutlinedIcon,
    RocketLaunchOutlinedIcon,
    TrendingUpOutlinedIcon,
    ExploreOutlinedIcon,
    PublicOutlinedIcon,
    LayersOutlinedIcon,
    CategoryOutlinedIcon,
];

export interface ScorecardOptionLook {
    icon: React.ReactNode;
    hint?: string;
}

/**
 * Icon + hint per scorecard card: a meaningful icon (and hint) when the option label suggests one ("Won",
 * "Pending", "Hot"…), otherwise the next unused icon from a fallback set, so no two cards share an icon.
 */
export function scorecardOptionLooks(labels: readonly string[]): ScorecardOptionLook[] {
    const used = new Set<SvgIconComponent>();
    const matched: (KeywordRule | undefined)[] = labels.map((label) => {
        const text = label.toLowerCase();
        const rule = KEYWORD_RULES.find((r) => !used.has(r.icon) && r.pattern.test(text));
        if (rule) used.add(rule.icon);
        return rule;
    });
    const pool = [...FALLBACK_ICONS, ...KEYWORD_RULES.map((r) => r.icon)].filter((icon, i, all) => all.indexOf(icon) === i);
    let next = 0;
    return matched.map((rule, i) => {
        let Icon = rule?.icon;
        if (!Icon) {
            while (next < pool.length && used.has(pool[next])) next += 1;
            // More cards than icons: wrap around rather than show none.
            Icon = pool[next] ?? FALLBACK_ICONS[i % FALLBACK_ICONS.length];
            used.add(Icon);
        }
        return { icon: <Icon />, hint: rule?.hint };
    });
}
