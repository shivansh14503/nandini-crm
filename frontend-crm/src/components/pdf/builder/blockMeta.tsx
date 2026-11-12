import React from 'react';
import TitleRoundedIcon from '@mui/icons-material/TitleRounded';
import NotesRoundedIcon from '@mui/icons-material/NotesRounded';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import HorizontalRuleRoundedIcon from '@mui/icons-material/HorizontalRuleRounded';
import HeightRoundedIcon from '@mui/icons-material/HeightRounded';
import InsertPageBreakOutlinedIcon from '@mui/icons-material/InsertPageBreakOutlined';
import ShortTextRoundedIcon from '@mui/icons-material/ShortTextRounded';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import FunctionsRoundedIcon from '@mui/icons-material/FunctionsRounded';
import AbcRoundedIcon from '@mui/icons-material/AbcRounded';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import NumbersRoundedIcon from '@mui/icons-material/NumbersRounded';
import DrawOutlinedIcon from '@mui/icons-material/DrawOutlined';
import { BLOCK_LABELS, richTextPlain, type Block, type BlockType } from '@/lib/pdf-document';

/** Icons, descriptions and palette groups of the builder's blocks. */

export const BLOCK_ICONS: Record<BlockType, React.ComponentType<{ sx?: object; fontSize?: 'small' | 'inherit' | 'medium' }>> = {
    title: TitleRoundedIcon,
    text: NotesRoundedIcon,
    image: ImageOutlinedIcon,
    divider: HorizontalRuleRoundedIcon,
    spacer: HeightRoundedIcon,
    pageBreak: InsertPageBreakOutlinedIcon,
    field: ShortTextRoundedIcon,
    detailsList: ListAltOutlinedIcon,
    address: PlaceOutlinedIcon,
    lineItems: TableChartOutlinedIcon,
    totals: FunctionsRoundedIcon,
    amountInWords: AbcRoundedIcon,
    terms: GavelOutlinedIcon,
    customFields: TuneOutlinedIcon,
    pageNumber: NumbersRoundedIcon,
    signature: DrawOutlinedIcon,
};

export const BLOCK_DESCRIPTIONS: Record<BlockType, string> = {
    title: 'A heading; can include fields',
    text: 'Paragraphs with formatting and fields',
    image: 'Company logo or an uploaded image',
    divider: 'A horizontal line',
    spacer: 'Empty vertical space',
    pageBreak: 'Start a new page',
    field: 'One field with its label',
    detailsList: 'Label / value rows of fields',
    address: 'Billing or shipping address',
    lineItems: 'The quotation items table',
    totals: 'Subtotal, tax and grand total',
    amountInWords: 'Grand total in words',
    terms: 'Remarks, payment terms, T&C',
    customFields: 'Admin-defined fields with values',
    pageNumber: '"Page 1 of 3" (header / footer)',
    signature: 'Signature image and caption',
};

export const BLOCK_GROUPS: { label: string; types: BlockType[] }[] = [
    { label: 'Basic', types: ['title', 'text', 'image', 'divider', 'spacer', 'pageBreak'] },
    { label: 'Record data', types: ['field', 'detailsList', 'address', 'customFields'] },
    { label: 'Quotation', types: ['lineItems', 'totals', 'amountInWords', 'terms'] },
    { label: 'Page', types: ['pageNumber', 'signature'] },
];

/** Short human name of a block for breadcrumbs / layer labels. */
export function blockName(block: Block): string {
    if (block.type === 'title' || block.type === 'text') {
        const text = richTextPlain(block.props.content);
        return text ? `${BLOCK_LABELS[block.type]}: ${text.length > 28 ? `${text.slice(0, 28)}…` : text}` : BLOCK_LABELS[block.type];
    }
    return BLOCK_LABELS[block.type];
}
