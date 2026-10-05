/**
 * DEMO / SAMPLE DATA ONLY. Never used by the real app code, only by `npm run seed`.
 * Kept in its own file so sample data is clearly separated from real logic.
 *
 * The employees are designed to demonstrate the assignment scenarios on Day 3:
 *  - several eligible employees with different workloads
 *  - an employee on leave (must be excluded)
 *  - an inactive employee (must be excluded)
 *  - territories/specializations where nobody matches (the "no eligible employee" case)
 */
import { EmployeeAvailability } from '../../employees/employee-availability.enum';
import { LeadPriority, LeadSource } from '../../leads/lead.enums';
import { SlaAction } from '../../sla/sla.enums';
import { AssignmentStrategy, TerritoryMode } from '../../assignment/assignment.enums';
import { Role } from '../../users/role.enum';

export const DEMO_STAFF_USERS = [
  { email: 'admin@neirah.test', role: Role.ADMIN },
  { email: 'manager@neirah.test', role: Role.MANAGER },
];

export const DEMO_EMPLOYEES = [
  {
    email: 'arun@neirah.test',
    fullName: 'Arun Kumar',
    specializations: ['Enterprise', 'SMB'],
    territory: 'Colombo',
    availability: EmployeeAvailability.AVAILABLE,
    isActive: true,
    maxWorkload: 10,
  },
  {
    email: 'priya@neirah.test',
    fullName: 'Priya Nair',
    specializations: ['Enterprise'],
    territory: 'Colombo',
    availability: EmployeeAvailability.AVAILABLE,
    isActive: true,
    maxWorkload: 10,
  },
  {
    email: 'kumar@neirah.test',
    fullName: 'Kumar Selvam',
    specializations: ['SMB'],
    territory: 'Colombo',
    availability: EmployeeAvailability.AVAILABLE,
    isActive: true,
    maxWorkload: 10,
  },
  {
    email: 'divya@neirah.test',
    fullName: 'Divya Raj',
    specializations: ['Enterprise'],
    territory: 'Colombo',
    availability: EmployeeAvailability.ON_LEAVE, // must be skipped by auto-assignment
    isActive: true,
    maxWorkload: 10,
  },
  {
    email: 'nimal@neirah.test',
    fullName: 'Nimal Perera',
    specializations: ['Enterprise', 'SMB'],
    territory: 'Jaffna',
    availability: EmployeeAvailability.AVAILABLE,
    isActive: true,
    maxWorkload: 10,
  },
  {
    email: 'sara@neirah.test',
    fullName: 'Sara Fernando',
    specializations: ['Consulting'],
    territory: 'Kandy',
    availability: EmployeeAvailability.AVAILABLE,
    isActive: false, // inactive: must be skipped by auto-assignment
    maxWorkload: 10,
  },
];

export const DEMO_LEADS = [
  {
    name: 'Ramesh Silva',
    email: 'ramesh@abc-pvt.example',
    company: 'ABC Pvt Ltd',
    source: LeadSource.WEBSITE,
    service: 'Enterprise',
    location: 'Colombo',
    estimatedValue: 500000,
    priority: LeadPriority.HIGH,
  },
  {
    name: 'Meena Raj',
    email: 'meena@fresh-mart.example',
    company: 'Fresh Mart',
    source: LeadSource.REFERRAL,
    service: 'SMB',
    location: 'Colombo',
    estimatedValue: 80000,
    priority: LeadPriority.MEDIUM,
  },
  {
    name: 'Tharun Vel',
    email: 'tharun@north-tech.example',
    company: 'North Tech',
    source: LeadSource.CAMPAIGN,
    service: 'Enterprise',
    location: 'Jaffna',
    estimatedValue: 350000,
    priority: LeadPriority.HIGH,
  },
  {
    name: 'Anjali Dev',
    email: 'anjali@kandy-crafts.example',
    company: 'Kandy Crafts',
    source: LeadSource.SOCIAL_MEDIA,
    service: 'SMB',
    location: 'Kandy',
    estimatedValue: 40000,
    priority: LeadPriority.LOW,
  },
  {
    // Nobody handles 'Government' in 'Galle' => demonstrates the "no eligible employee" case
    name: 'Ruwan Jayasuriya',
    email: 'ruwan@galle-council.example',
    company: 'Galle Municipal Council',
    source: LeadSource.MANUAL,
    service: 'Government',
    location: 'Galle',
    estimatedValue: 900000,
    priority: LeadPriority.HIGH,
  },
];

/** Demo assignment rules. Evaluated by ascending priority; first active matching rule wins. */
export const DEMO_RULES = [
  {
    name: 'High value: territory required',
    description: 'Leads worth 100000 or more go only to a specialist in the same territory.',
    priority: 10,
    isActive: true,
    minValue: 100000,
    requireSpecialization: true,
    territoryMode: TerritoryMode.REQUIRED,
    respectWorkloadLimit: true,
    strategy: AssignmentStrategy.LEAST_WORKLOAD,
  },
  {
    name: 'Round robin (disabled demo)',
    description: 'Inactive example: switch on to share SMB leads evenly.',
    priority: 50,
    isActive: false,
    matchService: 'SMB',
    requireSpecialization: true,
    territoryMode: TerritoryMode.PREFERRED,
    respectWorkloadLimit: true,
    strategy: AssignmentStrategy.ROUND_ROBIN,
  },
  {
    name: 'Default: specialization + preferred territory',
    description: 'Catch-all rule for every other lead.',
    priority: 100,
    isActive: true,
    requireSpecialization: true,
    territoryMode: TerritoryMode.PREFERRED,
    respectWorkloadLimit: true,
    strategy: AssignmentStrategy.LEAST_WORKLOAD,
  },
];

/** Demo SLA policies. Evaluated by ascending priority; first active matching policy applies. */
export const DEMO_SLA_POLICIES = [
  {
    name: 'High priority: respond in 30 minutes, then reassign',
    description:
      'Hot leads must be handled fast; otherwise they move to another eligible employee.',
    priority: 10,
    isActive: true,
    matchPriority: LeadPriority.HIGH,
    responseMinutes: 30,
    action: SlaAction.REASSIGN,
  },
  {
    name: 'High value: respond in 2 hours (flag only)',
    description: 'Big deals: managers are alerted, the owner keeps the lead.',
    priority: 20,
    isActive: true,
    minValue: 100000,
    responseMinutes: 120,
    action: SlaAction.FLAG,
  },
  {
    name: 'Default: respond within 1 day',
    description: 'Everything else: flag after 24 hours without any response.',
    priority: 100,
    isActive: true,
    responseMinutes: 1440,
    action: SlaAction.FLAG,
  },
];
