/** Mirrors backend-crm/src/modules/security-groups/securityGroup.service.ts (Admin › Security Groups). */

export interface SecurityGroupMember {
    id: number;
    username: string;
    /** Display name, else the username. */
    name: string;
    role: string;
    isActive: boolean;
}

export interface SecurityGroupDto {
    id: number;
    name: string;
    description: string | null;
    parentId: number | null;
    parentName: string | null;
    /** False = archived: keeps its members, grants nothing. */
    isActive: boolean;
    members: SecurityGroupMember[];
    /** Direct sub-groups. */
    subGroupCount: number;
    createdAt: string;
    createdBy: string | null;
    updatedAt: string;
    updatedBy: string | null;
}

/** A user the member picker offers, with the groups they are already in. */
export interface SecurityGroupUserOption extends SecurityGroupMember {
    groups: string[];
}

export interface SecurityGroupPayload {
    name: string;
    description: string | null;
    parentId: number | null;
}

export const SECURITY_GROUP_NAME_MAX_LENGTH = 100;
