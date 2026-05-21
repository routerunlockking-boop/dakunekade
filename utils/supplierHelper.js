const { Product, ImeiItem, SupplierPayment } = require('../database');

/**
 * Synchronize the SupplierPayment record for a given product and user.
 * @param {string} productId - The ID of the Product
 * @param {string} userId - The ID of the User
 * @param {string} [oldProductName] - The old product name (if renamed)
 * @param {string} [oldSupplierName] - The old supplier name (if changed)
 * @param {number} [qtyDiff=0] - The quantity difference (for normal products)
 */
async function syncSupplierPaymentForProduct(productId, userId, oldProductName, oldSupplierName, qtyDiff = 0) {
    try {
        const product = await Product.findById(productId);
        if (!product) return;

        // If product has no supplier, remove any existing supplier payment for it
        if (!product.supplier) {
            await SupplierPayment.deleteOne({
                supplier_name: oldSupplierName || { $exists: true },
                product_name: oldProductName || product.name,
                user_id: userId
            });
            return;
        }

        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

        if (product.is_imei_tracked) {
            // IMEI Tracked Product: count only In Stock IMEI items
            const imeis = await ImeiItem.find({ product_id: product._id, status: 'In Stock' });
            const qty = imeis.length;
            const imeiList = imeis.map(i => i.imei_number);
            const totalAmount = (product.cost_price || 0) * qty;

            const existingPayment = await SupplierPayment.findOne({
                supplier_name: oldSupplierName || product.supplier,
                product_name: oldProductName || product.name,
                user_id: userId
            });

            if (existingPayment) {
                existingPayment.supplier_name = product.supplier;
                existingPayment.product_name = product.name;
                existingPayment.cost_price = product.cost_price || 0;
                existingPayment.selling_price = product.price || 0;
                existingPayment.quantity = qty;
                existingPayment.total_amount = totalAmount;
                existingPayment.is_imei_product = true;
                existingPayment.imei_numbers = imeiList;

                if (product.is_supplier_paid) {
                    existingPayment.paid_amount = totalAmount;
                    existingPayment.paid_imeis = imeiList;
                }

                if (existingPayment.paid_amount >= totalAmount && totalAmount > 0) {
                    existingPayment.is_paid = true;
                    if (!existingPayment.paid_date) existingPayment.paid_date = today;
                } else {
                    existingPayment.is_paid = false;
                    existingPayment.paid_date = '';
                }

                await existingPayment.save();
            } else {
                const paidAmount = product.is_supplier_paid ? totalAmount : 0;
                await SupplierPayment.create({
                    user_id: userId,
                    supplier_name: product.supplier,
                    product_name: product.name,
                    quantity: qty,
                    cost_price: product.cost_price || 0,
                    total_amount: totalAmount,
                    paid_amount: paidAmount,
                    selling_price: product.price || 0,
                    is_paid: product.is_supplier_paid && totalAmount > 0,
                    paid_date: product.is_supplier_paid && totalAmount > 0 ? today : '',
                    sale_date: today,
                    notes: 'Auto-created from IMEI inventory',
                    is_imei_product: true,
                    imei_numbers: imeiList,
                    paid_imeis: product.is_supplier_paid ? imeiList : []
                });
            }
        } else {
            // Normal Product: quantity difference update
            const existingPayment = await SupplierPayment.findOne({
                supplier_name: oldSupplierName || product.supplier,
                product_name: oldProductName || product.name,
                user_id: userId
            });

            if (existingPayment) {
                existingPayment.supplier_name = product.supplier;
                existingPayment.product_name = product.name;
                existingPayment.cost_price = product.cost_price || 0;
                existingPayment.selling_price = product.price || 0;

                // Adjust quantity by diff
                if (qtyDiff !== 0) {
                    existingPayment.quantity += qtyDiff;
                    if (existingPayment.quantity < 0) existingPayment.quantity = 0;
                }

                const totalAmount = existingPayment.quantity * existingPayment.cost_price;
                existingPayment.total_amount = totalAmount;

                if (product.is_supplier_paid) {
                    existingPayment.paid_amount = totalAmount;
                }

                if (existingPayment.paid_amount >= totalAmount && totalAmount > 0) {
                    existingPayment.is_paid = true;
                    if (!existingPayment.paid_date) existingPayment.paid_date = today;
                } else {
                    existingPayment.is_paid = false;
                    existingPayment.paid_date = '';
                }

                await existingPayment.save();
            } else {
                const totalAmount = (product.cost_price || 0) * product.quantity;
                const paidAmount = product.is_supplier_paid ? totalAmount : 0;
                await SupplierPayment.create({
                    user_id: userId,
                    supplier_name: product.supplier,
                    product_name: product.name,
                    quantity: product.quantity,
                    cost_price: product.cost_price || 0,
                    total_amount: totalAmount,
                    paid_amount: paidAmount,
                    selling_price: product.price || 0,
                    is_paid: product.is_supplier_paid && totalAmount > 0,
                    paid_date: product.is_supplier_paid && totalAmount > 0 ? today : '',
                    sale_date: today,
                    notes: 'Auto-created from inventory'
                });
            }
        }
    } catch (err) {
        console.error('Error in syncSupplierPaymentForProduct:', err);
    }
}

module.exports = {
    syncSupplierPaymentForProduct
};
