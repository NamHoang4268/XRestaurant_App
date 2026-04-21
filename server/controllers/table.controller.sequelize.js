import Table from "../models-sequelize/table.model.js"; // Sequelize model
import User from "../models-sequelize/user.model.js"; // Sequelize model
import bcryptjs from "bcryptjs";
import { generateTableQRCode } from "../utils/qrCodeGenerator.js";
import { Op } from 'sequelize';
import sequelize from '../config/database.js'; // For transactions

// Create new table
export async function createTableController(request, response) {
    try {
        const { tableNumber, capacity, status, location, description } = request.body;

        // Validation
        if (!tableNumber) {
            return response.status(400).json({
                message: "Vui lòng nhập số bàn",
                error: true,
                success: false
            });
        }

        if (!capacity || capacity < 1) {
            return response.status(400).json({
                message: "Sức chứa phải lớn hơn 0",
                error: true,
                success: false
            });
        }

        // Sequelize: Check if table number already exists
        const existingTable = await Table.findOne({
            where: { tableNumber: tableNumber.toUpperCase() }
        });

        if (existingTable) {
            return response.status(400).json({
                message: "Số bàn đã tồn tại",
                error: true,
                success: false
            });
        }

        // Use transaction for table + account creation
        const transaction = await sequelize.transaction();

        try {
            // Sequelize: Create new table
            const savedTable = await Table.create({
                tableNumber: tableNumber.toUpperCase(),
                capacity,
                status: status || 'available',
                location: location || "",
                description: description || ""
            }, { transaction });

            // Auto-create table account + QR
            let qrWarning = null;
            try {
                const tableEmail = `table_${tableNumber.toLowerCase()}@internal.restaurant.com`;
                const randomPassword = Math.random().toString(36).slice(-12);
                const salt = await bcryptjs.genSalt(10);
                const hashPassword = await bcryptjs.hash(randomPassword, salt);

                // Sequelize: Create table user
                const savedUser = await User.create({
                    name: `Bàn ${tableNumber.toUpperCase()}`,
                    email: tableEmail,
                    password: hashPassword,
                    role: "TABLE",
                    linkedTableId: savedTable.id,
                    verifyEmail: true,
                    status: "Active"
                }, { transaction });

                // Generate QR code
                const { token, qrCodeImage } = await generateTableQRCode(
                    savedTable.id,
                    savedTable.tableNumber
                );

                // Sequelize: Update table with account and QR code
                await savedTable.update({
                    tableAccountId: savedUser.id,
                    qrCodeToken: token,
                    qrCode: qrCodeImage
                }, { transaction });

            } catch (qrError) {
                console.error('[Table] QR generation error:', qrError.message);
                qrWarning = qrError.message;
            }

            await transaction.commit();

            return response.status(201).json({
                message: "Tạo bàn thành công",
                data: savedTable,
                error: false,
                success: true,
                ...(qrWarning && { qrWarning: `Tạo bàn OK nhưng QR thất bại: ${qrWarning}` }),
            });

        } catch (error) {
            await transaction.rollback();
            throw error;
        }

    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}

// Get all tables
export async function getAllTablesController(request, response) {
    try {
        // Sequelize: findAll with order
        const tables = await Table.findAll({
            order: [['createdAt', 'DESC']]
        });

        return response.status(200).json({
            message: "Lấy danh sách bàn thành công",
            data: tables,
            error: false,
            success: true
        });

    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}

// Get table by ID
export async function getTableByIdController(request, response) {
    try {
        const { id } = request.params;

        // Sequelize: findByPk
        const table = await Table.findByPk(id);

        if (!table) {
            return response.status(404).json({
                message: "Không tìm thấy bàn",
                error: true,
                success: false
            });
        }

        return response.status(200).json({
            message: "Lấy thông tin bàn thành công",
            data: table,
            error: false,
            success: true
        });

    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}

// Update table
export async function updateTableController(request, response) {
    try {
        const { _id, tableNumber, capacity, status, location, description } = request.body;

        if (!_id) {
            return response.status(400).json({
                message: "Vui lòng cung cấp ID bàn",
                error: true,
                success: false
            });
        }

        // Sequelize: findByPk
        const table = await Table.findByPk(_id);
        if (!table) {
            return response.status(404).json({
                message: "Không tìm thấy bàn",
                error: true,
                success: false
            });
        }

        // Check if new table number already exists (if changing)
        if (tableNumber && tableNumber.toUpperCase() !== table.tableNumber) {
            const existingTable = await Table.findOne({
                where: {
                    tableNumber: tableNumber.toUpperCase(),
                    id: { [Op.ne]: _id }
                }
            });

            if (existingTable) {
                return response.status(400).json({
                    message: "Số bàn đã tồn tại",
                    error: true,
                    success: false
                });
            }
        }

        // Update fields
        const updateData = {};
        if (tableNumber) updateData.tableNumber = tableNumber.toUpperCase();
        if (capacity) updateData.capacity = capacity;
        if (status) updateData.status = status;
        if (location !== undefined) updateData.location = location;
        if (description !== undefined) updateData.description = description;

        // Sequelize: update
        await table.update(updateData);

        return response.status(200).json({
            message: "Cập nhật bàn thành công",
            data: table,
            error: false,
            success: true
        });

    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}

// Delete table (hard delete)
export async function deleteTableController(request, response) {
    try {
        const { _id } = request.body;

        if (!_id) {
            return response.status(400).json({
                message: "Vui lòng cung cấp ID bàn",
                error: true,
                success: false
            });
        }

        // Sequelize: findByPk
        const table = await Table.findByPk(_id);
        if (!table) {
            return response.status(404).json({
                message: "Không tìm thấy bàn",
                error: true,
                success: false
            });
        }

        // Use transaction for table + account deletion
        const transaction = await sequelize.transaction();

        try {
            // Delete table account if exists
            if (table.tableAccountId) {
                try {
                    const tableUser = await User.findByPk(table.tableAccountId, { transaction });
                    if (tableUser) {
                        await tableUser.destroy({ transaction });
                        console.log(`Deleted table account: ${table.tableAccountId}`);
                    }
                } catch (error) {
                    console.error('Error deleting table account:', error);
                    // Continue even if account deletion fails
                }
            }

            // Sequelize: destroy (hard delete)
            await table.destroy({ transaction });

            await transaction.commit();

            return response.status(200).json({
                message: "Xóa bàn thành công",
                error: false,
                success: true
            });

        } catch (error) {
            await transaction.rollback();
            throw error;
        }

    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}

// Update table status
export async function updateTableStatusController(request, response) {
    try {
        const { _id, status } = request.body;

        if (!_id || !status) {
            return response.status(400).json({
                message: "Vui lòng cung cấp ID bàn và trạng thái",
                error: true,
                success: false
            });
        }

        const validStatuses = ['available', 'occupied', 'reserved', 'maintenance'];
        if (!validStatuses.includes(status)) {
            return response.status(400).json({
                message: "Trạng thái không hợp lệ",
                error: true,
                success: false
            });
        }

        // Sequelize: findByPk and update
        const table = await Table.findByPk(_id);

        if (!table) {
            return response.status(404).json({
                message: "Không tìm thấy bàn",
                error: true,
                success: false
            });
        }

        await table.update({ status });

        return response.status(200).json({
            message: "Cập nhật trạng thái bàn thành công",
            data: table,
            error: false,
            success: true
        });

    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}

// Get available tables
export async function getAvailableTablesController(request, response) {
    try {
        // Sequelize: findAll with where and order
        const tables = await Table.findAll({
            where: { status: 'available' },
            order: [['tableNumber', 'ASC']]
        });

        return response.status(200).json({
            message: "Lấy danh sách bàn trống thành công",
            data: tables,
            error: false,
            success: true
        });

    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}

// POST /api/table/regenerate-qr
// Tạo lại QR code cho bàn đã tồn tại (fix bàn tạo thiếu QR)
export async function regenerateQRController(request, response) {
    try {
        const { _id } = request.body;
        if (!_id) {
            return response.status(400).json({
                message: "Vui lòng cung cấp ID bàn",
                error: true,
                success: false
            });
        }

        // Sequelize: findByPk
        const table = await Table.findByPk(_id);
        if (!table) {
            return response.status(404).json({
                message: "Không tìm thấy bàn",
                error: true,
                success: false
            });
        }

        // Use transaction
        const transaction = await sequelize.transaction();

        try {
            // Tạo table account nếu chưa có
            if (!table.tableAccountId) {
                const tableEmail = `table_${table.tableNumber.toLowerCase()}@internal.restaurant.com`;
                
                // Sequelize: findOne with where
                const existingUser = await User.findOne({
                    where: { email: tableEmail },
                    transaction
                });

                if (existingUser) {
                    table.tableAccountId = existingUser.id;
                } else {
                    const salt = await bcryptjs.genSalt(10);
                    const hashPassword = await bcryptjs.hash(Math.random().toString(36).slice(-12), salt);
                    
                    // Sequelize: create
                    const tableUser = await User.create({
                        name: `Bàn ${table.tableNumber}`,
                        email: tableEmail,
                        password: hashPassword,
                        role: "TABLE",
                        linkedTableId: table.id,
                        verifyEmail: true,
                        status: "Active"
                    }, { transaction });
                    
                    table.tableAccountId = tableUser.id;
                }
            }

            // Tạo lại QR
            const { token, qrCodeImage } = await generateTableQRCode(table.id, table.tableNumber);
            
            // Sequelize: update
            await table.update({
                qrCodeToken: token,
                qrCode: qrCodeImage
            }, { transaction });

            await transaction.commit();

            return response.status(200).json({
                message: `Tái tạo QR cho bàn ${table.tableNumber} thành công`,
                data: {
                    tableNumber: table.tableNumber,
                    qrCode: qrCodeImage,
                    testUrl: `${process.env.FRONTEND_URL}/table-login?token=${token}`
                },
                error: false,
                success: true
            });

        } catch (error) {
            await transaction.rollback();
            throw error;
        }

    } catch (error) {
        console.error('[regenerateQR] Error:', error.message);
        return response.status(500).json({
            message: error.message,
            error: true,
            success: false
        });
    }
}
