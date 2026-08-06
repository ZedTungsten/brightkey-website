// ── BrightKey Consolidated Financial Calculators ──
// centralizes COGS, OPEX, and P&L calculations for all statement pages.

window.BKFinancialCalculators = {
  calculateSupplierCostMonth(ledger = [], adjustments = [], monthKey) {
    const ledgerTotal = ledger.reduce((sum, entry) => {
      return String(entry.recognized_at || '').slice(0, 7) === monthKey
        ? sum + (Number(entry.total_cost_centavos) || 0)
        : sum;
    }, 0);
    const adjustmentTotal = adjustments.reduce((sum, entry) => {
      return String(entry.adjustment_date || '').slice(0, 7) === monthKey
        ? sum + (Number(entry.amount_cents) || 0)
        : sum;
    }, 0);
    return { ledgerTotal, adjustmentTotal, total: ledgerTotal + adjustmentTotal };
  },

  calculateCommissionMonth(employees = [], assignments = [], bookings = [], monthKey) {
    const byEmployee = new Map(employees.map(employee => [employee.id, 0]));
    assignments.forEach(assignment => {
      const booking = bookings.find(item => item.id === assignment.booking_id);
      if (!booking || String(booking.status || '').toLowerCase() === 'cancelled') return;
      if (String(booking.scheduled_date || '').slice(0, 7) !== monthKey) return;
      let doors = [];
      if (typeof booking.doors === 'string') {
        try { doors = JSON.parse(booking.doors); } catch (_) {}
      } else if (Array.isArray(booking.doors)) {
        doors = booking.doors;
      }
      const door = doors[assignment.product_index];
      const isDone = Boolean(door?.completed) || ['done', 'completed', 'finished'].includes(String(booking.status || '').toLowerCase());
      if (!isDone) return;
      byEmployee.set(assignment.employee_id, (byEmployee.get(assignment.employee_id) || 0) + (Number(assignment.amount) || 0));
    });
    return { byEmployee, total: [...byEmployee.values()].reduce((sum, value) => sum + value, 0) };
  },

  calculateShippingMonth(transactions = [], deliveries = [], monthKey) {
    const deliveryMap = new Map(deliveries.map(delivery => [delivery.reference_id, delivery]));
    const seen = new Set();
    const rows = [];
    transactions.forEach(transaction => {
      if (String(transaction.timestamp_dispatched || '').slice(0, 7) !== monthKey) return;
      if (!transaction.reference_id || seen.has(transaction.reference_id)) return;
      seen.add(transaction.reference_id);
      const delivery = deliveryMap.get(transaction.reference_id) || {};
      const base = Number(delivery.base_fee) || 0;
      const tip1 = Number(delivery.tip_1) || 0;
      const tip2 = Number(delivery.tip_2) || 0;
      const toll = Number(delivery.toll) || 0;
      rows.push({ reference_id: transaction.reference_id, customer_name: delivery.customer_name || transaction.customer_name || '', base, tip1, tip2, toll, total: base + tip1 + tip2 + toll });
    });
    return { rows, total: rows.reduce((sum, row) => sum + row.total, 0) };
  },

  calculateJournalMonth(accounts = [], entries = [], monthKey) {
    const categoryByAccount = new Map(accounts.map(account => [account.name, account.category]));
    const categories = {};
    entries.forEach(entry => {
      if (String(entry.date || '').slice(0, 7) !== monthKey) return;
      const debitCentavos = Math.round((Number(entry.debit) || 0) * 100);
      if (debitCentavos <= 0) return;
      const category = categoryByAccount.get(entry.account);
      if (!category) return;
      categories[category] ||= { total: 0, accounts: {} };
      categories[category].total += debitCentavos;
      categories[category].accounts[entry.account] = (categories[category].accounts[entry.account] || 0) + debitCentavos;
    });
    return categories;
  },

  calculateEmployeeAdjustmentsMonth(adjustments = [], monthKey) {
    const byEmployee = new Map();
    adjustments.forEach(adjustment => {
      if (String(adjustment.date || '').slice(0, 7) !== monthKey) return;
      byEmployee.set(adjustment.employee_id, (byEmployee.get(adjustment.employee_id) || 0) + (Number(adjustment.amount) || 0));
    });
    return { byEmployee, total: [...byEmployee.values()].reduce((sum, value) => sum + value, 0) };
  },

  calculateSoftwareMonth(subscriptions = [], billingRecords = [], monthKey) {
    const monthStart = `${monthKey}-01`;
    const [year, month] = monthKey.split('-').map(Number);
    const monthEnd = `${monthKey}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
    const rows = subscriptions.filter(subscription => {
      const subscribed = (subscription.subscribed_date || '1970-01-01') <= monthEnd;
      const notUnsubscribed = !subscription.unsubscribed_date || subscription.unsubscribed_date >= monthStart;
      const hasBilling = billingRecords.some(record => record.subscription_id === subscription.id && String(record.billing_month || '').slice(0, 7) === monthKey && record.mode !== 'unsubscribed');
      return (subscribed && notUnsubscribed) || hasBilling;
    }).map(subscription => {
      const plan = this.resolvePlanForMonth(subscription, monthStart, billingRecords);
      let cost = 0;
      if (plan.mode === 'monthly' || plan.mode === 'pay_as_you_go') cost = Number(plan.cost_centavos) || 0;
      else if (plan.mode === 'annual') cost = Math.round((Number(plan.cost_centavos) || 0) / 12);
      return { subscription, mode: plan.mode, costCentavos: cost };
    }).filter(row => row.mode !== 'unsubscribed');
    return { rows, total: rows.reduce((sum, row) => sum + row.costCentavos, 0) };
  },

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
    const ocularWeight = payoutSettings.ocular_credit !== undefined ? payoutSettings.ocular_credit : 0;
    const repairWeight = payoutSettings.repair_credit !== undefined ? payoutSettings.repair_credit : 0;
    const leadRateVal = payoutSettings.lead_rate || 1000;
    const assistRateVal = payoutSettings.assist_rate || 500;
    const ocularRateVal = payoutSettings.ocular_rate || 0;
    const repairRateVal = payoutSettings.repair_rate || 0;
    const ocularRepairEffectiveFrom = String(payoutSettings.ocular_repair_effective_from || '');
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
          const assignmentSkus = String(b.product_skus || '')
            .split('|')
            .map((sku) => sku.trim().toLowerCase())
            .filter(Boolean);
          const orderNo = String(b.order_no || '').toUpperCase();
          const isDayOff = assignmentSkus.includes('day off') || orderNo.startsWith('DO-');
          const isBackjob = assignmentSkus.includes('backjob') || orderNo.startsWith('BJ-');
          const isOcular = assignmentSkus.includes('ocular');
          const isRepair = assignmentSkus.includes('repair');
          if (isDayOff || isBackjob) return;
          if ((isOcular || isRepair) && (!ocularRepairEffectiveFrom || b.scheduled_date < ocularRepairEffectiveFrom)) return;

          const assignedDoors = this.getAssignedDoorsForEmployee(b, emp.id);
          assignedDoors.forEach(d => {
            if (d.completed) doorJobs.push({ ...d, roles: isOcular ? ['ocular'] : isRepair ? ['repair'] : d.roles });
          });
        });

        doorJobs.sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));

        let runningCredit = 0;
        let thresholdEarnings = 0;
        let serviceEarnings = 0;

        doorJobs.forEach(job => {
          let weight = 0;
          let jobRate = 0;
          if (job.roles.includes('lead')) weight = leadWeight;
          else if (job.roles.includes('assist')) weight = assistWeight;
          else if (job.roles.includes('ocular')) weight = ocularWeight;
          else if (job.roles.includes('repair')) weight = repairWeight;
          if (job.roles.includes('lead')) jobRate = leadRateVal;
          else if (job.roles.includes('assist')) jobRate = assistRateVal;
          else if (job.roles.includes('ocular')) jobRate = ocularRateVal;
          else if (job.roles.includes('repair')) jobRate = repairRateVal;

          if (job.roles.includes('service')) {
            job.skus.forEach(sku => {
              const matchedService = extraServicesList.find(es => es.sku === sku);
              if (matchedService) serviceEarnings += matchedService.rate;
            });
          }

          const previousCredit = runningCredit;
          const newCredit = previousCredit + weight;
          if (newCredit > thresholdVal) {
            thresholdEarnings += jobRate;
          }
          runningCredit = newCredit;
        });

        monthlyValues[mKey].installations += ((thresholdEarnings + serviceEarnings) * 100);
      });
    });

    // 3. Salaries, Specials, Commissions, Adjustments
    months.forEach(m => {
      const mKey = m.key;
      const monthBookings = bookings.filter(b => {
        if (!b.scheduled_date) return false;
        const d = new Date(b.scheduled_date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === mKey;
      });

      employees.forEach(emp => {
        // Fallback/Always calculate dynamically from active employment base salary
        if (emp.employment_status === 'Active') {
          const baseSal = Math.round((emp.salary || emp.monthly_salary || 0) * 100);
          monthlyValues[mKey].salaries += baseSal;
        }

        // Resolve checked special payouts for this employee in the month
        const configuredSpecialSchedules = trackerConfig.specialSchedules || [];
        const specialSchedules = window.BKSpecialPayoutHistory?.forMonth(configuredSpecialSchedules, mKey) || configuredSpecialSchedules;
        specialSchedules.forEach(spec => {
          if (spec.employeeId === emp.id) {
            const isPaid = specialPayoutState?.[mKey]?.[`${emp.id}_${spec.day}`] || false;
            if (isPaid) {
              monthlyValues[mKey].salaries += Math.round((Number(spec.value) || 0) * 100);
            }
          }
        });

        // Resolve commissions for this employee in the month
        monthBookings.forEach(b => {
          const bookingComms = commissionAssignments.filter(ca => ca.booking_id === b.id && ca.employee_id === emp.id);
          bookingComms.forEach(ca => {
            monthlyValues[mKey].commissions += (ca.amount || 0);
          });
        });

        // Resolve adjustments for this employee in the month
        const empAdjs = adjustmentsList.filter(a => a.employee_id === emp.id && a.date && a.date.slice(0, 7) === mKey);
        empAdjs.forEach(a => {
          monthlyValues[mKey].adjustments += Math.round((Number(a.amount) || 0) * 100);
        });
      });
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
