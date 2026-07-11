// ── BrightKey Consolidated Financial Calculators ──
// centralizes COGS, OPEX, and P&L calculations for all statement pages.

window.BKFinancialCalculators = {
  // Resolves software subscriptions plan for a target month (cents)
  resolvePlanForMonth(s, targetMonthStr, billingRecords = []) {
    const subBills = billingRecords.filter(b => b.subscription_id === s.id);
    const exactBill = subBills.find(b => b.billing_month === targetMonthStr);
    if (exactBill) return { mode: exactBill.mode, cost_centavos: exactBill.cost_centavos };

    if (s.mode === 'pay_as_you_go') {
      const subStartMonth = (s.subscribed_date || '').slice(0, 7);
      if (subStartMonth === targetMonthStr) return { mode: 'pay_as_you_go', cost_centavos: s.cost_centavos };
      return { mode: 'pay_as_you_go', cost_centavos: 0 };
    }

    const pastBills = subBills.filter(b => b.billing_month <= targetMonthStr);
    if (pastBills.length > 0) {
      pastBills.sort((a, b) => b.billing_month.localeCompare(a.billing_month));
      const latestBill = pastBills[0];
      if (latestBill.mode === 'pay_as_you_go') return { mode: 'pay_as_you_go', cost_centavos: 0 };
      return { mode: latestBill.mode, cost_centavos: latestBill.cost_centavos };
    }
    return { mode: s.mode, cost_centavos: s.cost_centavos };
  },

  // Resolves assigned doors for a booking and employee to calculate installation weight credits
  getAssignedDoorsForEmployee(b, empId) {
    let doorsArr = [];
    if (b.doors) {
      if (typeof b.doors === 'string') {
        try { doorsArr = JSON.parse(b.doors); } catch(_) {}
      } else if (Array.isArray(b.doors)) {
        doorsArr = b.doors;
      }
    }

    let bInsts = [];
    if (b.installers) {
      if (typeof b.installers === 'string') {
        try { bInsts = JSON.parse(b.installers); } catch(_) {}
      } else if (Array.isArray(b.installers)) {
        bInsts = b.installers;
      }
    }

    const isBookingLevelInstaller = bInsts.some(inst => inst && inst.id === empId) || 
                                    (b.installer_id && b.installer_id.split(' | ').includes(empId));

    const bookingHasDoorLevelInstallers = doorsArr.some(d => d && Array.isArray(d.installers) && d.installers.some(inst => inst && (inst.id || inst.name)));

    const assignedDoors = [];

    if (doorsArr.length === 0) {
      if (isBookingLevelInstaller) {
        let roles = [];
        const matchedBInsts = bInsts.filter(inst => inst && inst.id === empId);
        if (matchedBInsts.length > 0) {
          matchedBInsts.forEach(inst => {
            const r = inst.role || 'lead';
            if (!roles.includes(r)) roles.push(r);
          });
        } else if (b.installer_id) {
          const ids = b.installer_id.split(' | ');
          const myIdIdx = ids.indexOf(empId);
          if (myIdIdx !== -1) {
            roles.push(myIdIdx === 0 ? 'lead' : 'assist');
          }
        }
        if (roles.length === 0) roles.push('lead');
        
        let productsArr = [];
        if (b.products) {
          if (typeof b.products === 'string') {
            try { productsArr = JSON.parse(b.products); } catch(_) {}
          } else if (Array.isArray(b.products)) {
            productsArr = b.products;
          }
        }
        const skus = (b.product_skus || '').split(' | ').filter(Boolean);
        const activeSkus = productsArr.length > 0 
          ? productsArr.filter(p => !p.cancelled && p.sku !== 'ADD-ON LABOR').map(p => p.sku)
          : skus;

        assignedDoors.push({
          completed: b.status === 'done' || b.status === 'completed' || b.status === 'finished',
          roles: roles,
          skus: activeSkus,
          completed_at: b.updated_at || b.created_at || b.scheduled_date,
          scheduled_date: b.scheduled_date
        });
      }
      return assignedDoors;
    }

    let productsArr = [];
    if (b.products) {
      if (typeof b.products === 'string') {
        try { productsArr = JSON.parse(b.products); } catch(_) {}
      } else if (Array.isArray(b.products)) {
        productsArr = b.products;
      }
    }
    const skus = (b.product_skus || '').split(' | ');
    const anyDoorHasAttachedProducts = doorsArr.some(d => d && Array.isArray(d.products) && d.products.length > 0);
    const isSingleDoorGrouping = (doorsArr.length === 1 && productsArr.length > 0);
    const skuOccurrenceCount = new Map();

    doorsArr.forEach((door, index) => {
      let isAssignedToThisDoor = false;
      let roles = [];

      if (door && Array.isArray(door.installers)) {
        const matchedInsts = door.installers.filter(inst => inst && inst.id === empId);
        if (matchedInsts.length > 0) {
          isAssignedToThisDoor = true;
          matchedInsts.forEach(inst => {
            const r = inst.role || 'lead';
            if (!roles.includes(r)) roles.push(r);
          });
        }
      } else if (bookingHasDoorLevelInstallers) {
        isAssignedToThisDoor = false;
      } else {
        isAssignedToThisDoor = isBookingLevelInstaller;
        const matchedBInsts = bInsts.filter(inst => inst && inst.id === empId);
        if (matchedBInsts.length > 0) {
          matchedBInsts.forEach(inst => {
            const r = inst.role || 'lead';
            if (!roles.includes(r)) roles.push(r);
          });
        } else if (b.installer_id) {
          const ids = b.installer_id.split(' | ');
          const myIdIdx = ids.indexOf(empId);
          if (myIdIdx !== -1) {
            roles.push(myIdIdx === 0 ? 'lead' : 'assist');
          }
        }
      }

      if (isAssignedToThisDoor) {
        const doorSkus = [];
        if (anyDoorHasAttachedProducts && door) {
          const attachedSkus = door.products || [];
          attachedSkus.forEach(sku => {
            const matchingProds = productsArr.filter(p => p.sku === sku);
            const occurrenceIndex = skuOccurrenceCount.get(sku) || 0;
            const matchedProd = matchingProds[occurrenceIndex];
            if (matchedProd && !matchedProd.cancelled) {
              doorSkus.push(matchedProd.sku);
            }
            skuOccurrenceCount.set(sku, occurrenceIndex + 1);
          });
        } else if (isSingleDoorGrouping) {
          productsArr.forEach(p => {
            if (p.sku !== 'ADD-ON LABOR' && !p.cancelled) {
              doorSkus.push(p.sku);
            }
          });
        } else {
          if (productsArr[index] && !productsArr[index].cancelled) {
            doorSkus.push(productsArr[index].sku);
          } else if (skus[index]) {
            doorSkus.push(skus[index]);
          }
        }

        assignedDoors.push({
          completed: !!door.completed,
          roles: roles,
          skus: doorSkus,
          completed_at: door.completed_at || b.updated_at || b.created_at || b.scheduled_date,
          scheduled_date: b.scheduled_date
        });
      } else {
        if (anyDoorHasAttachedProducts && door) {
          const attachedSkus = door.products || [];
          attachedSkus.forEach(sku => {
            const occurrenceIndex = skuOccurrenceCount.get(sku) || 0;
            skuOccurrenceCount.set(sku, occurrenceIndex + 1);
          });
        }
      }
    });

    return assignedDoors;
  },

  // Generates aggregated reporting variables for a target range of months (cents)
  generateMonthlyReport(params) {
    const {
      months,
      products,
      bookings,
      employees,
      payslipRecords,
      deliveries,
      payoutSettings,
      trackerConfig,
      commissionAssignments,
      adjustmentsList,
      journalAccounts,
      generalJournal,
      softwareSubscriptions,
      softwareBilling,
      specialPayoutState
    } = params;

    const monthlyValues = {};
    months.forEach(m => {
      monthlyValues[m.key] = {
        revenueBooking: 0,
        supplierCost: 0,
        installations: 0,
        commissions: 0,
        shipping: 0,
        gasAllowance: 0,
        packagingSupplies: 0,
        otherCogs: {},
        
        salaries: 0,
        adjustments: 0,
        softwareApps: 0,
        admin: { total: 0, details: {} },
        marketingSales: { total: 0, details: {} },
        operationsSupport: { total: 0, details: {} }
      };
    });

    const dealerPriceMap = {};
    products.forEach(p => {
      if (p.sku) dealerPriceMap[p.sku.toLowerCase()] = p.dealer_price || 0;
    });

    const thresholdVal = payoutSettings.installations_before_crediting || 15;
    const leadWeight = payoutSettings.lead_credit !== undefined ? payoutSettings.lead_credit : 1.0;
    const assistWeight = payoutSettings.assist_credit !== undefined ? payoutSettings.assist_credit : 0.5;
    const leadRateVal = payoutSettings.lead_rate || 1000;
    const extraServicesList = (payoutSettings.extra_services || []).map(es => {
      let sku = es.sku || es.name || '';
      if (sku === 'Welding Baseplate Metal') sku = 'BASEPLATE-M';
      if (sku === 'Welding Baseplate Stainless') sku = 'BASEPLATE-S';
      return { sku, rate: es.rate };
    });

    // 1. Process Bookings for Revenue & Supplier Cost
    bookings.forEach(b => {
      if (!b.scheduled_date) return;
      const bDate = new Date(b.scheduled_date);
      const mKey = `${bDate.getFullYear()}-${String(bDate.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyValues[mKey]) return;

      if (b.order_no && b.order_no.startsWith('ORD-')) {
        const grandTotal = parseInt(b.grand_total) || 0;
        const balanceDue = parseInt(b.balance_due) || 0;
        let depositCentavos = parseInt(b.deposit_amount) || 0;
        if (b.deduction_labels && b.deduction_values) {
          const dLabels = b.deduction_labels.split('|').map(s => s.trim().toLowerCase());
          const dValues = b.deduction_values.split('|').map(s => s.trim());
          dLabels.forEach((label, idx) => {
            if (label.includes('deposit')) {
              depositCentavos += Math.round((parseFloat(dValues[idx]) || 0) * 100);
            }
          });
        }
        const absDepositCentavos = Math.abs(depositCentavos);
        const orderGrandTotal = grandTotal > 0 ? grandTotal : (balanceDue + absDepositCentavos);
        monthlyValues[mKey].revenueBooking += (orderGrandTotal + absDepositCentavos);
      }

      let skusArr = [];
      let qtysArr = [];
      if (b.product_skus) skusArr = b.product_skus.split(' | ').filter(Boolean);
      if (b.product_qtys) qtysArr = b.product_qtys.split(' | ').map(Number);
      skusArr.forEach((sku, idx) => {
        const qty = qtysArr[idx] || 0;
        const dPrice = dealerPriceMap[sku.toLowerCase()] || 0;
        monthlyValues[mKey].supplierCost += (qty * dPrice);
      });
    });

    // 2. Installations
    months.forEach(m => {
      const mKey = m.key;
      const monthBookings = bookings.filter(b => {
        if (!b.scheduled_date) return false;
        const d = new Date(b.scheduled_date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === mKey;
      });

      employees.forEach(emp => {
        const doorJobs = [];
        monthBookings.forEach(b => {
          const assignedDoors = this.getAssignedDoorsForEmployee(b, emp.id);
          assignedDoors.forEach(d => {
            if (d.completed) doorJobs.push(d);
          });
        });

        doorJobs.sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));

        let runningCredit = 0;
        let thresholdEarnings = 0;
        let serviceEarnings = 0;

        doorJobs.forEach(job => {
          let weight = 0;
          if (job.roles.includes('lead')) weight = leadWeight;
          else if (job.roles.includes('assist')) weight = assistWeight;

          if (job.roles.includes('service')) {
            job.skus.forEach(sku => {
              const matchedService = extraServicesList.find(es => es.sku === sku);
              if (matchedService) serviceEarnings += matchedService.rate;
            });
          }

          const previousCredit = runningCredit;
          const newCredit = previousCredit + weight;
          if (newCredit > thresholdVal) {
            const extraCredit = weight;
            thresholdEarnings += (extraCredit * leadRateVal);
          }
          runningCredit = newCredit;
        });

        monthlyValues[mKey].installations += ((thresholdEarnings + serviceEarnings) * 100);
      });
    });

    // 3. Salaries, Specials, Commissions, Adjustments
    months.forEach(m => {
      const mKey = m.key;
      const monthRecords = payslipRecords.filter(r => r.payout_month === mKey);

      if (monthRecords.length > 0) {
        monthRecords.forEach(r => {
          monthlyValues[mKey].salaries += Math.round((Number(r.basic_paid || r.salary) || 0) * 100);
          monthlyValues[mKey].salaries += Math.round((Number(r.special_payouts) || 0) * 100);
          monthlyValues[mKey].commissions += Math.round((Number(r.commissions) || 0) * 100);
          monthlyValues[mKey].adjustments += Math.round((Number(r.adjustments) || 0) * 100);
        });
      } else {
        employees.forEach(emp => {
          if (emp.employment_status !== 'Active') return;
          const baseSal = Math.round((emp.salary || emp.monthly_salary || 0) * 100);
          monthlyValues[mKey].salaries += baseSal;
        });

        const specialSchedules = trackerConfig.specialSchedules || [];
        specialSchedules.forEach(spec => {
          monthlyValues[mKey].salaries += Math.round((Number(spec.value) || 0) * 100);
        });

        const monthBookings = bookings.filter(b => {
          if (!b.scheduled_date) return false;
          const d = new Date(b.scheduled_date);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === mKey;
        });
        monthBookings.forEach(b => {
          const bookingComms = commissionAssignments.filter(ca => ca.booking_id === b.id);
          bookingComms.forEach(ca => {
            monthlyValues[mKey].commissions += (ca.amount || 0);
          });
        });

        const monthAdjs = adjustmentsList.filter(a => a.date && a.date.slice(0, 7) === mKey);
        monthAdjs.forEach(a => {
          monthlyValues[mKey].adjustments += Math.round((Number(a.amount) || 0) * 100);
        });
      }
    });

    // 4. Shipping
    deliveries.forEach(del => {
      if (!del.timestamp_dispatched) return;
      const dDate = new Date(del.timestamp_dispatched);
      const mKey = `${dDate.getFullYear()}-${String(dDate.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyValues[mKey]) return;
      const baseFee = del.base_fee || 0;
      const tip1 = del.tip_1 || 0;
      const tip2 = del.tip_2 || 0;
      const toll = del.toll || 0;
      monthlyValues[mKey].shipping += (baseFee + tip1 + tip2 + toll);
    });

    // 5. General Ledger Mapping
    const accountCategoryMap = {};
    journalAccounts.forEach(a => {
      accountCategoryMap[a.name] = a.category;
    });

    generalJournal.forEach(entry => {
      if (!entry.date) return;
      const mKey = entry.date.slice(0, 7);
      if (!monthlyValues[mKey]) return;

      const category = accountCategoryMap[entry.account];
      const debitVal = Math.round((parseFloat(entry.debit) || 0) * 100);
      if (debitVal <= 0) return;

      if (category === 'COGS') {
        if (entry.account.toLowerCase() === 'gas allowance') {
          monthlyValues[mKey].gasAllowance += debitVal;
        } else if (entry.account.toLowerCase() === 'packaging supplies') {
          monthlyValues[mKey].packagingSupplies += debitVal;
        } else {
          monthlyValues[mKey].otherCogs[entry.account] = (monthlyValues[mKey].otherCogs[entry.account] || 0) + debitVal;
        }
      } else if (category === 'OPEX - Admin') {
        monthlyValues[mKey].admin.total += debitVal;
        monthlyValues[mKey].admin.details[entry.account] = (monthlyValues[mKey].admin.details[entry.account] || 0) + debitVal;
      } else if (category === 'OPEX - Marketing & Sales') {
        monthlyValues[mKey].marketingSales.total += debitVal;
        monthlyValues[mKey].marketingSales.details[entry.account] = (monthlyValues[mKey].marketingSales.details[entry.account] || 0) + debitVal;
      } else if (category === 'OPEX - Operations Support') {
        monthlyValues[mKey].operationsSupport.total += debitVal;
        monthlyValues[mKey].operationsSupport.details[entry.account] = (monthlyValues[mKey].operationsSupport.details[entry.account] || 0) + debitVal;
      }
    });

    // 6. Software & Apps Subscriptions
    months.forEach(m => {
      const mKey = m.key;
      const currentMonthDateStr = `${mKey}-01`;
      const currentMonthLastDayStr = `${mKey}-${new Date(m.year, m.month, 0).getDate()}`;

      const activeInMonthSubs = softwareSubscriptions.filter(s => {
        const subDate = s.subscribed_date || '1970-01-01';
        const unsubDate = s.unsubscribed_date;
        const isSubscribed = subDate <= currentMonthLastDayStr;
        const isNotUnsubscribed = !unsubDate || unsubDate >= currentMonthDateStr;
        return isSubscribed && isNotUnsubscribed;
      });

      activeInMonthSubs.forEach(s => {
        const plan = this.resolvePlanForMonth(s, currentMonthDateStr, softwareBilling);
        const mode = plan.mode;
        const costCentavos = plan.cost_centavos;

        if (mode === 'unsubscribed') return;

        let resolvedCostCentavos = 0;
        if (mode === 'pay_as_you_go' || mode === 'monthly') {
          resolvedCostCentavos = costCentavos;
        } else if (mode === 'annual') {
          resolvedCostCentavos = Math.round(costCentavos / 12);
        }
        monthlyValues[mKey].softwareApps += resolvedCostCentavos;
      });
    });

    return monthlyValues;
  }
};
